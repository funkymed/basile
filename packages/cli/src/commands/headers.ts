import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Args, Command, Flags } from '@oclif/core';
import { theme, ICON, type Finding, type RecipeTarget } from '@basile/core';
import { headersScanner } from '@basile/scanner-headers';
import { printBanner } from '../ui/banner.js';

/**
 * `basile headers <url>` — quick HTTP security header audit shortcut.
 *
 * Invokes the existing `headers` scanner against a single URL without
 * requiring a cookbook. Output mirrors the structure of `subfinder`/`waf`
 * shortcuts: human-readable summary by default, full JSON payload with
 * `--json`, optional `-o` file destination.
 */
export default class Headers extends Command {
  static override description = 'Audit HTTP security headers of a URL (HSTS, CSP, X-Frame-Options, etc.)';

  static override examples = [
    'basile headers https://example.com',
    'basile headers https://example.com --json',
    'basile headers https://example.com -o headers.json',
  ];

  static override args = {
    url: Args.string({ description: 'Target URL (must include scheme)', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Emit the full findings payload as JSON', default: false }),
    output: Flags.string({ char: 'o', description: 'Write output to file' }),
    quiet: Flags.boolean({ char: 'q', description: 'Suppress banner', default: false }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Headers);
    const showBanner = !flags.quiet && !flags.json;
    if (showBanner) await printBanner();

    let parsed: URL;
    try {
      parsed = new URL(args.url);
    } catch {
      this.error(`Invalid URL: ${args.url} (include scheme, e.g. https://)`, { exit: 2 });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      this.error(`Unsupported scheme: ${parsed.protocol} (use http:// or https://)`, { exit: 2 });
    }

    const target: RecipeTarget = {
      id: 'cli',
      type: 'url',
      url: args.url,
      scanners: ['headers'],
    };

    if (!flags.json) {
      process.stdout.write(`${theme.dim('· auditing ')}${theme.bold(args.url)}${theme.dim(' …')}\n`);
    }

    let findings: Finding[];
    try {
      findings = await headersScanner.run(target, { outDir: tmpdir() });
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
    }

    if (flags.json) {
      const payload = JSON.stringify(findings, null, 2);
      if (flags.output) await writeFile(flags.output, `${payload}\n`, 'utf8');
      else process.stdout.write(`${payload}\n`);
      return;
    }

    // Pretty summary: count by severity + per-finding line.
    const bySeverity: Record<string, number> = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    }
    const totalIssues = findings.length;

    const lines: string[] = [];
    if (totalIssues === 0) {
      lines.push(`${theme.success(ICON.ok)} ${theme.bold('All security headers present')} on ${args.url}`);
    } else {
      const breakdown = Object.entries(bySeverity)
        .map(([sev, n]) => `${n} ${sev}`)
        .join(', ');
      lines.push(`${theme.warn(ICON.warn)} ${theme.bold(`${totalIssues} issue(s)`)} on ${args.url} — ${breakdown}`);
      lines.push('');
      for (const f of findings) {
        const icon = sevIcon(f.severity);
        lines.push(`  ${icon} ${theme.bold(f.rule ?? '?')} — ${f.message}`);
      }
    }
    const text = `${lines.join('\n')}\n`;
    if (flags.output) await writeFile(flags.output, text, 'utf8');
    else process.stdout.write(text);
  }
}

function sevIcon(sev: string): string {
  switch (sev) {
    case 'critical':
    case 'high':
      return theme.error('●');
    case 'medium':
      return theme.warn('●');
    case 'low':
    case 'info':
    default:
      return theme.dim('●');
  }
}
