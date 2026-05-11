import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Args, Command, Flags } from '@oclif/core';
import Table from 'cli-table3';
import { extractRootDomain, theme, ICON, type RecipeTarget } from '@basile/core';
import { attackSurfaceScanner } from '@basile/scanner-attack-surface';
import { printBanner } from '../ui/banner.js';

type InventoryEntry = {
  host: string;
  url: string;
  category: string;
  status: number;
  grade: string;
  waf: string | null;
};

type SummaryRaw = {
  root_domain: string;
  metrics: {
    duration_ms: number;
    subdomains_total: number;
    subdomains_alive: number;
    grade_global: string;
    waf_coverage_pct: number;
    exposed_dev_count: number;
    exposed_internal_count: number;
  };
  inventory: InventoryEntry[];
};

/**
 * `basile recon <domain>` — full attack-surface mapping shortcut.
 *
 * Composes `subfinder` + `wafw00f-lite` + header grading into a single pass.
 * Default output is a human-readable inventory table; `--json` returns the
 * full multi-finding payload for downstream tooling.
 */
export default class Recon extends Command {
  static override description = 'Map the attack surface of a domain (subdomains + headers + WAF)';

  static override examples = [
    'basile recon example.com',
    'basile recon example.com --json',
    'basile recon example.com -o recon.json --json',
  ];

  static override args = {
    domain: Args.string({ description: 'Root domain to map', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Emit the full findings payload as JSON', default: false }),
    output: Flags.string({ char: 'o', description: 'Write output to file' }),
    parallel: Flags.integer({
      description: 'Concurrency hint (currently fixed at 10 inside the scanner)',
      default: 10,
    }),
    quiet: Flags.boolean({ char: 'q', description: 'Suppress banner', default: false }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Recon);
    const showBanner = !flags.quiet && !flags.json;
    if (showBanner) await printBanner();

    const { root } = extractRootDomain(args.domain);
    const target: RecipeTarget = {
      id: 'cli',
      type: 'domain',
      domain: root,
      scanners: ['attack-surface'],
    };

    if (!flags.json) {
      process.stdout.write(
        `${theme.dim('· mapping attack surface for ')}${theme.bold(root)}${theme.dim(' …')}\n\n`,
      );
    }

    let findings;
    try {
      findings = await attackSurfaceScanner.run(target, { outDir: tmpdir() });
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
    }

    if (flags.json) {
      const payload = JSON.stringify(findings, null, 2);
      if (flags.output) await writeFile(flags.output, `${payload}\n`, 'utf8');
      else process.stdout.write(`${payload}\n`);
      return;
    }

    const summary = findings.find((f) => f.rule === 'attack_surface.summary');
    const raw = summary?.raw as SummaryRaw | undefined;
    if (!raw) {
      this.warn('No summary finding returned by attack-surface scanner.');
      return;
    }

    const out: string[] = [];
    out.push(renderTable(raw.inventory));
    out.push('');
    out.push(
      `${theme.bold('Global')}: ${theme.accent(raw.metrics.grade_global)}  ` +
        `${theme.dim('·')} ${raw.metrics.subdomains_alive}/${raw.metrics.subdomains_total} alive  ` +
        `${theme.dim('·')} ${raw.metrics.waf_coverage_pct}% WAF  ` +
        `${theme.dim('·')} ${(raw.metrics.duration_ms / 1000).toFixed(1)}s`,
    );
    if (raw.metrics.exposed_dev_count > 0 || raw.metrics.exposed_internal_count > 0) {
      out.push(
        `${theme.warn(ICON.warn)} ${raw.metrics.exposed_dev_count} dev/staging · ${raw.metrics.exposed_internal_count} internal host(s) publicly exposed`,
      );
    }
    const text = `${out.join('\n')}\n`;
    if (flags.output) await writeFile(flags.output, text, 'utf8');
    else process.stdout.write(text);
  }
}

function renderTable(inventory: InventoryEntry[]): string {
  const table = new Table({
    head: [
      theme.bold('Host'),
      theme.bold('Category'),
      theme.bold('Status'),
      theme.bold('Grade'),
      theme.bold('WAF'),
    ],
    style: { head: [], border: [] },
  });
  for (const entry of inventory) {
    table.push([
      entry.host,
      theme.dim(entry.category),
      colorStatus(entry.status),
      colorGrade(entry.grade),
      entry.waf ?? theme.dim('—'),
    ]);
  }
  return table.toString();
}

function colorStatus(status: number): string {
  if (status >= 200 && status < 300) return theme.success(String(status));
  if (status >= 300 && status < 400) return theme.accent(String(status));
  if (status >= 400 && status < 500) return theme.warn(String(status));
  return theme.error(String(status));
}

function colorGrade(grade: string): string {
  if (grade === 'A+' || grade === 'A') return theme.success(grade);
  if (grade === 'B' || grade === 'C') return theme.accent(grade);
  return theme.error(grade);
}
