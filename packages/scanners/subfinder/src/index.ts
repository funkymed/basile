import {
  exec,
  extractRootDomain,
  type Finding,
  type RecipeTarget,
  which,
} from '@basile/core';
import type { Scanner } from '@basile/runner';

/**
 * Default hard timeout for the subfinder process. Subfinder spawns dozens of
 * external HTTP queries; in practice 60s captures the vast majority of results
 * without blocking the pipeline.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Maximum hosts to keep in the finding payload (avoid bloating reports). */
const MAX_HOSTS_IN_RAW = 500;

export const subfinderScanner: Scanner = {
  name: 'subfinder',
  category: 'security',
  profile: 'security',

  /** Supports both bare-domain and URL targets (root domain extracted from URL). */
  supports: (t: RecipeTarget): boolean => t.type === 'domain' || t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'domain' && target.type !== 'url') return [];

    if (!which('subfinder')) {
      throw new Error(
        'Binary "subfinder" not found. Run `basile setup --scanners subfinder` to install.',
      );
    }

    const input = target.type === 'domain' ? target.domain : target.url;
    const { root, wasSubdomain } = extractRootDomain(input);

    // subfinder -silent emits one host per line on stdout; stderr is noise.
    const result = await exec(
      ['subfinder', '-d', root, '-silent', '-timeout', '10', '-max-time', '1'],
      { okExitCodes: [0], timeoutMs: DEFAULT_TIMEOUT_MS },
    );

    const hosts = parseSubfinderOutput(result.stdout, root);

    const findings: Finding[] = [];

    // Emit one informational finding summarising the enumeration. Per-host
    // analysis is handled by the `attack-surface` composite scanner.
    findings.push({
      scanner: 'subfinder',
      category: 'security',
      severity: 'info',
      target: target.id,
      rule: 'attack_surface.subdomain_inventory',
      message: `${hosts.length} subdomain${hosts.length === 1 ? '' : 's'} discovered for ${root}${wasSubdomain ? ' (root extracted from input subdomain)' : ''}`,
      raw: {
        root_domain: root,
        input_was_subdomain: wasSubdomain,
        hosts_count: hosts.length,
        hosts: hosts.slice(0, MAX_HOSTS_IN_RAW),
        ...(hosts.length > MAX_HOSTS_IN_RAW ? { hosts_truncated: hosts.length - MAX_HOSTS_IN_RAW } : {}),
      },
    });

    return findings;
  },
};

/**
 * Parse subfinder stdout into a deduped sorted list of hosts scoped to the
 * provided root domain. Tolerates blank lines and stray ANSI codes.
 */
export function parseSubfinderOutput(stdout: string, root: string): string[] {
  const rootEscaped = root.replace(/\./g, '\\.');
  const hostRegex = new RegExp(`(?:^|\\.)${rootEscaped}$`);
  const set = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const raw = line.trim().toLowerCase();
    if (!raw) continue;
    // Reject any wildcard-containing entry before normalization to avoid
    // promoting "*staging.example.com" → "staging.example.com" silently.
    if (raw.includes('*')) continue;
    if (!hostRegex.test(raw)) continue;
    set.add(raw);
  }
  return [...set].sort();
}
