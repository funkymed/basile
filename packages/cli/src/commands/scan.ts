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
  static override description = 'Run an audit scan (recipe or ad-hoc)';

  static override examples = [
    'basile scan --recipe cookbook.yaml',
    'basile scan --target ./apps/api --stacks symfony --scanners phpstan',
    'basile scan --url https://example.com --scanners lighthouse',
    'basile scan --recipe cookbook.yaml --auto-install',
  ];

  static override flags = {
    recipe: Flags.string({ char: 'r', description: 'Path to YAML cookbook' }),
    target: Flags.string({ description: 'Code path to scan (ad-hoc)' }),
    url: Flags.string({ description: 'URL to scan (ad-hoc)' }),
    stacks: Flags.string({ description: 'Stacks CSV (php,symfony,typescript,react,nodejs)' }),
    scanners: Flags.string({ description: 'Scanners CSV' }),
    output: Flags.string({ char: 'o', description: 'Output directory' }),
    ui: Flags.string({
      description: 'UI mode',
      options: ['pretty', 'plain', 'json', 'quiet'],
      default: 'pretty',
    }),
    'auto-install': Flags.boolean({ description: 'Install missing tools without prompting' }),
    'skip-preflight': Flags.boolean({ description: 'Skip preflight check' }),
    'skip-report': Flags.boolean({ description: 'Skip final report generation' }),
    full: Flags.boolean({ description: 'Full report (all severities, no filter)' }),
    quiet: Flags.boolean({ char: 'q', description: 'Minimal output' }),
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
          this.warn(`Unknown scanners (ignored): ${pre.unknown.join(', ')}`);
        }

        if (pre.missing.length > 0) {
          const isTTY = process.stdout.isTTY;
          if (flags['auto-install']) {
            await this.runInstallPlan(pre.installPlan, true);
          } else if (!isTTY) {
            this.error(
              `Missing tools in non-interactive mode. Run:\n${pre.installPlan
                .map((s) => `  ${s.pretty}`)
                .join('\n')}\nOr use --auto-install / --skip-preflight.`,
              { exit: 2 },
            );
          } else {
            const action = await p.select({
              message: `${pre.missing.length} tool(s) missing. What do you want to do?`,
              options: [
                { value: 'install', label: 'Install now' },
                { value: 'skip', label: 'Skip these scanners (gaps)' },
                { value: 'abort', label: 'Cancel' },
              ],
            });
            if (p.isCancel(action) || action === 'abort') {
              p.cancel('Cancelled.');
              this.exit(1);
            }
            if (action === 'install') {
              await this.runInstallPlan(pre.installPlan, false);
            } else {
              const filtered = dropScannersFromRecipe(recipe, pre.missing);
              effectiveRecipe = filtered.recipe;
              for (const g of filtered.gaps) coverageGaps.push({ ...g, reason: 'missing tool (skip preflight)' });
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
      if (target && scanner) coverageGaps.push({ target, scanner, reason: 'scanner not registered' });
    }

    // ---- Report ----
    if (!flags['skip-report']) {
      const { summary, mdPath, filteredOut } = await writeReport(outDir, effectiveRecipe, result.findings, coverageGaps.map((g) => ({ scanner: g.scanner, target: g.target, reason: g.reason })), {
        full: flags.full ?? false,
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
          this.warn(`PDF not generated: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!quiet) {
        const errors = result.results.filter((r) => r.error).length;
        const lines = [
          `${theme.bold('Audit complete')} · ${effectiveRecipe.name}`,
          '',
          `${summary.totalFindings} findings · ${effectiveRecipe.targets.length} targets`,
          `Score: ${summary.score} (verdict: ${summary.verdict})`,
          errors > 0 ? `${ICON.warn} ${errors} scanner(s) failed` : `${ICON.ok} no scanner failures`,
          coverageGaps.length > 0 ? `${ICON.warn} ${coverageGaps.length} coverage gap(s)` : '',
          filteredOut > 0 ? `${theme.dim('⊘')} ${filteredOut} finding(s) hidden by default (use --full for the full report)` : '',
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
      this.error('Provide --recipe OR --scanners (and --target/--url + --stacks)', { exit: 1 });
    }

    if (typeof flags.target === 'string') {
      const stacks = typeof flags.stacks === 'string' ? flags.stacks.split(',').map((s) => s.trim()) : [];
      if (stacks.length === 0) this.error('--stacks required with --target', { exit: 1 });
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
        report: { formats: ['md' as const], template: 'executive' as const, group_by: ['target' as const, 'severity' as const], smart_filter: true },
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
        report: { formats: ['md' as const], template: 'executive' as const, group_by: ['target' as const, 'severity' as const], smart_filter: true },
      };
    }

    this.error('Provide --target <path> or --url <url> in ad-hoc mode', { exit: 1 });
  }

  private async runInstallPlan(
    plan: { scanner: string; mode: 'local' | 'docker'; command: string[]; pretty: string; needsSudo: boolean; approxSizeMB?: number }[],
    auto: boolean,
  ): Promise<void> {
    const { exec } = await import('@basile/core');
    for (const step of plan) {
      if (!auto) {
        const proceed = await p.confirm({
          message: `Install ${step.scanner} via \`${step.pretty}\`?${step.needsSudo ? ' (sudo)' : ''}${
            step.approxSizeMB ? ` (~${step.approxSizeMB} MB)` : ''
          }`,
        });
        if (p.isCancel(proceed) || !proceed) continue;
      }
      const spinner = p.spinner();
      spinner.start(`Installing ${step.scanner}`);
      try {
        await exec(step.command, { timeoutMs: 600_000 });
        spinner.stop(`${step.scanner} installed`);
      } catch (err) {
        spinner.stop(`${step.scanner} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
