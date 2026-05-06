import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import boxen from 'boxen';
import { theme, type Finding, type Recipe } from '@basile/core';
import { writeReport } from '@basile/reporter-markdown';
import { renderPdf } from '@basile/reporter-pdf';

export default class Report extends Command {
  static override description = 'Consolide un run de scan en rapport (Markdown + PDF) sans relancer les scanners';

  static override examples = [
    'basile report --from reports/2026-05-06-audit-client-x',
    'basile report --from reports/<run> --template technical',
    'basile report --from reports/<run> --pdf',
  ];

  static override flags = {
    from: Flags.string({ char: 'f', required: true, description: 'Dossier produit par scan (contient meta.json + findings.ndjson)' }),
    template: Flags.string({ description: 'Template à utiliser', options: ['executive', 'technical', 'security'] }),
    pdf: Flags.boolean({ description: 'Génère aussi un PDF via Pandoc' }),
    output: Flags.string({ char: 'o', description: 'Dossier de sortie (défaut: même que --from)' }),
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
      this.error(`meta.json introuvable dans ${fromDir}. Lance d'abord 'basile scan'.`, { exit: 1 });
    }

    const ndjson = await readFile(ndjsonPath, 'utf8').catch(() => '');
    const findings: Finding[] = ndjson
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Finding);

    const gaps = (meta.gaps ?? []).map((g) => {
      const base: { scanner: string; reason: string; target?: string } = {
        scanner: g.scanner,
        reason: g.reason ?? 'non spécifié',
      };
      if (g.target !== undefined) base.target = g.target;
      return base;
    });
    const { mdPath, summary } = await writeReport(outDir, meta.recipe, findings, gaps, {
      ...(flags.template ? { template: flags.template } : {}),
    });

    let pdfPath: string | undefined;
    if (flags.pdf) {
      try {
        pdfPath = await renderPdf(mdPath, { template: 'eisvogel', toc: true });
      } catch (err) {
        this.warn(`PDF non généré: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!flags.quiet) {
      const lines = [
        `${theme.bold('Rapport généré')} · ${meta.recipe.name}`,
        '',
        `${summary.totalFindings} findings · score ${summary.score} (${summary.verdict})`,
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
