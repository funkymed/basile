import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import * as p from '@clack/prompts';
import boxen from 'boxen';
import {
  loadRecipe,
  resolveOutputDir,
  preflight,
  dropScannersFromRecipe,
  theme,
  ICON,
  type Recipe,
} from '@basile/core';
import { runScan } from '@basile/runner';
import { writeReport } from '@basile/reporter-markdown';
import { renderPdf } from '@basile/reporter-pdf';
import { createDefaultRegistry } from '../registry.js';
import { printBanner } from '../ui/banner.js';
import { renderStatusTable } from '../ui/table.js';

type Ui = 'pretty' | 'plain' | 'json' | 'quiet';

export default class Scan extends Command {
  static override description = "Lance un scan d'audit (recipe ou ad-hoc)";

  static override examples = [
    'basile scan --recipe cookbook.yaml',
    'basile scan --target ./apps/api --stacks symfony --scanners phpstan',
    'basile scan --url https://example.com --scanners lighthouse',
    'basile scan --recipe cookbook.yaml --auto-install',
  ];

  static override flags = {
    recipe: Flags.string({ char: 'r', description: 'Chemin vers cookbook YAML' }),
    target: Flags.string({ description: 'Chemin code à scanner (ad-hoc)' }),
    url: Flags.string({ description: 'URL à scanner (ad-hoc)' }),
    stacks: Flags.string({ description: 'Stacks CSV (php,symfony,typescript,react,nodejs)' }),
    scanners: Flags.string({ description: 'Scanners CSV' }),
    output: Flags.string({ char: 'o', description: 'Dossier de sortie' }),
    ui: Flags.string({
      description: 'Mode UI',
      options: ['pretty', 'plain', 'json', 'quiet'],
      default: 'pretty',
    }),
    'auto-install': Flags.boolean({ description: 'Installe les outils manquants sans demander' }),
    'skip-preflight': Flags.boolean({ description: 'Saute la vérification preflight' }),
    'skip-report': Flags.boolean({ description: 'Ne génère pas le rapport final' }),
    quiet: Flags.boolean({ char: 'q', description: 'Sortie minimale' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Scan);
    const ui = (flags.ui as Ui) ?? 'pretty';
    const quiet = flags.quiet || ui === 'quiet' || ui === 'json';

    if (!quiet) printBanner();

    const recipe = await this.resolveRecipe(flags);
    const outDir = path.resolve(flags.output ?? resolveOutputDir(recipe));
    await mkdir(outDir, { recursive: true });

    let effectiveRecipe = recipe;
    const coverageGaps: Array<{ target: string; scanner: string; reason: string }> = [];

    // ---- Preflight ----
    if (!flags['skip-preflight']) {
      const pre = await preflight({ kind: 'recipe', recipe });
      if (!pre.ok) {
        if (!quiet) {
          process.stdout.write('\n');
          process.stdout.write(renderStatusTable(pre.statuses) + '\n\n');
        }
        if (pre.unknown.length > 0) {
          this.warn(`Scanners inconnus (ignorés): ${pre.unknown.join(', ')}`);
        }

        if (pre.missing.length > 0) {
          const isTTY = process.stdout.isTTY;
          if (flags['auto-install']) {
            await this.runInstallPlan(pre.installPlan, true);
          } else if (!isTTY) {
            this.error(
              `Outils manquants en mode non-interactif. Lance:\n${pre.installPlan
                .map((s) => `  ${s.pretty}`)
                .join('\n')}\nOu utilise --auto-install / --skip-preflight.`,
              { exit: 2 },
            );
          } else {
            const action = await p.select({
              message: `${pre.missing.length} outil(s) manquant(s). Que faire ?`,
              options: [
                { value: 'install', label: 'Installer maintenant' },
                { value: 'skip', label: 'Skip ces scanners (gaps)' },
                { value: 'abort', label: 'Annuler' },
              ],
            });
            if (p.isCancel(action) || action === 'abort') {
              p.cancel('Annulé.');
              this.exit(1);
            }
            if (action === 'install') {
              await this.runInstallPlan(pre.installPlan, false);
            } else {
              const filtered = dropScannersFromRecipe(recipe, pre.missing);
              effectiveRecipe = filtered.recipe;
              for (const g of filtered.gaps) coverageGaps.push({ ...g, reason: 'outil manquant (skip preflight)' });
            }
          }
        }
      }
    }

    // ---- Scan ----
    const startedAt = new Date();
    const registry = createDefaultRegistry();
    const result = await runScan(effectiveRecipe, registry, { outDir, ui });
    const endedAt = new Date();

    // Add registry-level gaps to coverage gaps.
    for (const gap of result.gaps) {
      const [target, scanner] = gap.split(':');
      if (target && scanner) coverageGaps.push({ target, scanner, reason: 'scanner non enregistré' });
    }

    // ---- Report ----
    if (!flags['skip-report']) {
      const { summary, mdPath } = await writeReport(outDir, effectiveRecipe, result.findings, coverageGaps.map((g) => ({ scanner: g.scanner, target: g.target, reason: g.reason })), {
        runMeta: {
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: endedAt.getTime() - startedAt.getTime(),
        },
      });

      const formats = effectiveRecipe.report.formats;
      const pdfPaths: string[] = [];
      if (formats.includes('pdf')) {
        try {
          const pdfPath = await renderPdf(mdPath, { template: 'eisvogel', toc: true });
          pdfPaths.push(pdfPath);
        } catch (err) {
          this.warn(`PDF non généré: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!quiet) {
        const errors = result.results.filter((r) => r.error).length;
        const lines = [
          `${theme.bold('Audit terminé')} · ${effectiveRecipe.name}`,
          '',
          `${summary.totalFindings} findings · ${effectiveRecipe.targets.length} cibles`,
          `Score: ${summary.score} (verdict: ${summary.verdict})`,
          errors > 0 ? `${ICON.warn} ${errors} scanner(s) en échec` : `${ICON.ok} aucun échec scanner`,
          coverageGaps.length > 0 ? `${ICON.warn} ${coverageGaps.length} coverage gap(s)` : '',
          '',
          `📂 ${outDir}`,
          `   ├─ report.md`,
          ...pdfPaths.map((p) => `   ├─ ${path.basename(p)}`),
          `   └─ findings.ndjson`,
        ].filter(Boolean);
        process.stdout.write(
          '\n' +
            boxen(lines.join('\n'), {
              padding: 1,
              borderStyle: 'round',
              borderColor: summary.verdict === 'fail' ? 'red' : summary.verdict === 'warn' ? 'yellow' : 'green',
            }) +
            '\n',
        );
      }
    }

    if (ui === 'json') {
      process.stdout.write(
        JSON.stringify({
          recipe: effectiveRecipe.name,
          outDir,
          findings: result.findings.length,
          results: result.results,
          gaps: coverageGaps,
        }) + '\n',
      );
    }
  }

  private async resolveRecipe(flags: Record<string, unknown>): Promise<Recipe> {
    if (typeof flags.recipe === 'string') {
      return loadRecipe(flags.recipe);
    }
    // Build an ad-hoc recipe from --target / --url + --stacks + --scanners.
    const scanners = typeof flags.scanners === 'string' ? flags.scanners.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (scanners.length === 0) {
      this.error('Fournis --recipe OU --scanners (et --target/--url + --stacks)', { exit: 1 });
    }

    if (typeof flags.target === 'string') {
      const stacks = typeof flags.stacks === 'string' ? flags.stacks.split(',').map((s) => s.trim()) : [];
      if (stacks.length === 0) this.error('--stacks requis avec --target', { exit: 1 });
      const targetPath = flags.target;
      return {
        name: `adhoc-${path.basename(targetPath)}`,
        output: './reports/{{date}}-{{name}}',
        parallel: 4,
        targets: [
          {
            id: path.basename(targetPath),
            type: 'code' as const,
            path: targetPath,
            stacks: stacks as ('php' | 'symfony' | 'wordpress' | 'typescript' | 'react' | 'nodejs' | 'url')[],
            scanners,
          },
        ],
        report: { formats: ['md' as const], template: 'executive' as const, group_by: ['target' as const, 'severity' as const] },
      };
    }

    if (typeof flags.url === 'string') {
      const url = flags.url;
      const id = new URL(url).hostname.replace(/[^a-z0-9]+/gi, '-');
      return {
        name: `adhoc-${id}`,
        output: './reports/{{date}}-{{name}}',
        parallel: 4,
        targets: [{ id, type: 'url' as const, url, scanners }],
        report: { formats: ['md' as const], template: 'executive' as const, group_by: ['target' as const, 'severity' as const] },
      };
    }

    this.error('Précise --target <path> ou --url <url> en mode ad-hoc', { exit: 1 });
  }

  private async runInstallPlan(
    plan: { scanner: string; mode: 'local' | 'docker'; command: string[]; pretty: string; needsSudo: boolean; approxSizeMB?: number }[],
    auto: boolean,
  ): Promise<void> {
    const { exec } = await import('@basile/core');
    for (const step of plan) {
      if (!auto) {
        const proceed = await p.confirm({
          message: `Installer ${step.scanner} via \`${step.pretty}\` ?${step.needsSudo ? ' (sudo)' : ''}${
            step.approxSizeMB ? ` (~${step.approxSizeMB} MB)` : ''
          }`,
        });
        if (p.isCancel(proceed) || !proceed) continue;
      }
      const spinner = p.spinner();
      spinner.start(`Installation ${step.scanner}`);
      try {
        await exec(step.command, { timeoutMs: 600_000 });
        spinner.stop(`${step.scanner} installé`);
      } catch (err) {
        spinner.stop(`${step.scanner} ECHEC: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
