import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import boxen from 'boxen';
import { loadRecipe, theme, type Finding, type Recipe } from '@basile/core';
import { writeReport } from '@basile/reporter-markdown';
import { renderPdf } from '@basile/reporter-pdf';

export default class Report extends Command {
  static override description = 'Consolidate a scan run into a report (Markdown + PDF) without re-running scanners';

  static override examples = [
    'basile report --from reports/2026-05-06-audit-client-x',
    'basile report --from reports/<run> --template technical',
    'basile report --from reports/<run> --pdf',
  ];

  static override flags = {
    from: Flags.string({ char: 'f', required: true, description: 'Directory produced by scan (contains meta.json + findings.ndjson)' }),
    recipe: Flags.string({ char: 'r', description: 'Override the recipe from meta.json (useful for iterating on exclude_findings without rescan)' }),
    template: Flags.string({ description: 'Template to use', options: ['executive', 'technical', 'security'] }),
    pdf: Flags.boolean({ description: 'Also generate a PDF via Pandoc' }),
    output: Flags.string({ char: 'o', description: 'Output directory (default: same as --from)' }),
    full: Flags.boolean({ description: 'Full report (all severities, no filter)' }),
    quiet: Flags.boolean({ char: 'q' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Report);
    const fromDir = path.resolve(flags.from);
    const outDir = path.resolve(flags.output ?? fromDir);

    const metaPath = path.join(fromDir, 'meta.json');
    const ndjsonPath = path.join(fromDir, 'findings.ndjson');

    let meta: { recipe: Recipe; gaps?: Array<{ target?: string; scanner: string; reason?: string }> };
    try {
      meta = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch {
      this.error(`meta.json not found in ${fromDir}. Run 'basile scan' first.`, { exit: 1 });
    }

    // Override recipe from disk (--recipe flag) so user can iterate triage without rescan.
    if (typeof flags.recipe === 'string') {
      meta.recipe = await loadRecipe(flags.recipe);
    }

    const ndjson = await readFile(ndjsonPath, 'utf8').catch(() => '');
    const findings: Finding[] = ndjson
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Finding);

    const gaps = (meta.gaps ?? []).map((g) => {
      const base: { scanner: string; reason: string; target?: string } = {
        scanner: g.scanner,
        reason: g.reason ?? 'unspecified',
      };
      if (g.target !== undefined) base.target = g.target;
      return base;
    });
    const { mdPath, summary, filteredOut } = await writeReport(outDir, meta.recipe, findings, gaps, {
      full: flags.full ?? false,
      ...(flags.template ? { template: flags.template } : {}),
    });

    let pdfPath: string | undefined;
    if (flags.pdf) {
      try {
        pdfPath = await renderPdf(mdPath, { template: 'eisvogel', toc: true });
      } catch (err) {
        this.warn(`PDF not generated: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!flags.quiet) {
      const lines = [
        `${theme.bold('Report generated')} · ${meta.recipe.name}`,
        '',
        `${summary.totalFindings} findings · score ${summary.score} (${summary.verdict})`,
        ...(filteredOut > 0 ? [`${theme.dim('⊘')} ${filteredOut} finding(s) hidden (use --full for the full report)`] : []),
        '',
        `📂 ${outDir}`,
        `   ├─ ${path.basename(mdPath)}`,
        ...(pdfPath ? [`   └─ ${path.basename(pdfPath)}`] : []),
      ];
      process.stdout.write(
        '\n' + boxen(lines.join('\n'), { padding: 1, borderStyle: 'round', borderColor: 'cyan' }) + '\n',
      );
    }
  }
}
