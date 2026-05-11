import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Args, Command, Flags } from '@oclif/core';
import { theme, ICON, type RecipeTarget } from '@basile/core';
import { wafw00fLiteScanner } from '@basile/scanner-wafw00f-lite';
import { printBanner } from '../ui/banner.js';

/**
 * `basile waf <url>` — quick WAF/CDN fingerprinting shortcut.
 *
 * The scanner already performs a passive HEAD+GET pass and, when nothing is
 * matched, retries with an anomaly payload. The `--aggressive` flag is kept
 * informational so users can opt-in semantically — current scanner behaviour
 * is identical (always falls back) but future versions may gate the second
 * pass behind this flag.
 */
export default class Waf extends Command {
  static override description = 'Detect WAF/CDN protecting a URL (headers + body signatures)';

  static override examples = [
    'basile waf https://example.com',
    'basile waf https://example.com --json',
    'basile waf https://example.com --aggressive',
  ];

  static override args = {
    url: Args.string({ description: 'Target URL (must include scheme)', required: true }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Emit the full finding payload as JSON', default: false }),
    output: Flags.string({ char: 'o', description: 'Write output to file' }),
    aggressive: Flags.boolean({
      description: 'Force anomaly probe (currently always run on no-match)',
      default: false,
    }),
    quiet: Flags.boolean({ char: 'q', description: 'Suppress banner', default: false }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Waf);
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
      scanners: ['wafw00f-lite'],
    };

    if (!flags.json) {
      process.stdout.write(`${theme.dim('· probing ')}${theme.bold(args.url)}${theme.dim(' …')}\n`);
    }

    let findings;
    try {
      findings = await wafw00fLiteScanner.run(target, { outDir: tmpdir() });
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
    }

    const finding = findings[0];
    if (flags.json) {
      const payload = JSON.stringify(finding ?? null, null, 2);
      if (flags.output) await writeFile(flags.output, `${payload}\n`, 'utf8');
      else process.stdout.write(`${payload}\n`);
      return;
    }

    const raw = finding?.raw as { detected?: boolean; wafs?: string[] } | undefined;
    const detected = raw?.detected === true;
    const wafs = raw?.wafs ?? [];

    const lines: string[] = [];
    if (detected) {
      lines.push(`${theme.success(ICON.ok)} ${theme.bold('WAF detected')}: ${wafs.join(', ')}`);
    } else {
      lines.push(`${theme.warn(ICON.warn)} ${theme.bold('No WAF detected')} for ${args.url}`);
    }
    if (flags.aggressive) {
      lines.push(theme.dim('  (aggressive probe acknowledged — scanner already runs it on no-match)'));
    }
    const text = `${lines.join('\n')}\n`;
    if (flags.output) await writeFile(flags.output, text, 'utf8');
    else process.stdout.write(text);
  }
}
