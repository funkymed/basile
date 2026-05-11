import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Args, Command, Flags } from '@oclif/core';
import { extractRootDomain, theme, ICON, type RecipeTarget } from '@basile/core';
import { subfinderScanner } from '@basile/scanner-subfinder';
import { printBanner } from '../ui/banner.js';

/**
 * `basile subfinder <domain>` — one-shot subdomain enumeration shortcut.
 *
 * Wraps the `subfinderScanner` so users can run a single scan without
 * authoring a cookbook. Defaults to pipe-friendly host-per-line output;
 * `--json` exposes the full finding payload for tooling.
 */
export default class Subfinder extends Command {
  static override description = 'Enumerate subdomains for a root domain (passive recon)';

  static override examples = [
    'basile subfinder example.com',
    'basile subfinder example.com --json',
    'basile subfinder example.com -o hosts.txt',
    'basile subfinder api.example.com --strict',
  ];

  static override args = {
    domain: Args.string({
      description: 'Root domain to enumerate (subdomains are auto-stripped unless --strict)',
      required: true,
    }),
  };

  static override flags = {
    json: Flags.boolean({ description: 'Emit the full finding payload as JSON', default: false }),
    output: Flags.string({ char: 'o', description: 'Write output to file instead of stdout' }),
    strict: Flags.boolean({
      description: 'Error if input is a subdomain (do not auto-extract root)',
      default: false,
    }),
    silent: Flags.boolean({ description: 'Suppress non-essential output', default: false }),
    quiet: Flags.boolean({ char: 'q', description: 'Suppress banner', default: false }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Subfinder);
    const showBanner = !flags.quiet && !flags.silent && !flags.json;
    if (showBanner) await printBanner();

    const { root, wasSubdomain } = extractRootDomain(args.domain);
    if (flags.strict && wasSubdomain) {
      this.error(
        `Input "${args.domain}" is a subdomain. Root would be "${root}". Re-run without --strict or pass the bare root domain.`,
        { exit: 2 },
      );
    }

    const target: RecipeTarget = {
      id: 'cli',
      type: 'domain',
      domain: root,
      scanners: ['subfinder'],
    };

    if (!flags.silent && !flags.json) {
      process.stdout.write(
        `${theme.dim('· enumerating subdomains for ')}${theme.bold(root)}${theme.dim(' …')}\n`,
      );
    }

    let findings;
    try {
      findings = await subfinderScanner.run(target, { outDir: tmpdir() });
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
    }

    const finding = findings[0];
    const hosts = (finding?.raw as { hosts?: string[] } | undefined)?.hosts ?? [];

    if (flags.json) {
      const payload = JSON.stringify(finding ?? null, null, 2);
      if (flags.output) {
        await writeFile(flags.output, `${payload}\n`, 'utf8');
      } else {
        process.stdout.write(`${payload}\n`);
      }
      return;
    }

    const text = hosts.join('\n');
    if (flags.output) {
      await writeFile(flags.output, text ? `${text}\n` : '', 'utf8');
      if (!flags.silent) {
        process.stdout.write(
          `${theme.success(ICON.ok)} ${theme.bold(String(hosts.length))} host(s) written to ${theme.accent(flags.output)}\n`,
        );
      }
    } else {
      if (text) process.stdout.write(`${text}\n`);
      if (!flags.silent) {
        process.stderr.write(
          `${theme.dim(`(${hosts.length} host${hosts.length === 1 ? '' : 's'} for ${root})`)}\n`,
        );
      }
    }
  }
}
