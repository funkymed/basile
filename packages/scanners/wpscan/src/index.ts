import {
  execHybrid,
  ExecError,
  type Finding,
  type RecipeTarget,
  type Severity,
} from '@basile/core';
import type { Scanner } from '@basile/runner';

type WpscanVulnRef = {
  cve?: string[];
  url?: string[];
  [k: string]: unknown;
};

type WpscanVulnerability = {
  title?: string;
  fixed_in?: string | null;
  references?: WpscanVulnRef;
};

type WpscanComponent = {
  vulnerabilities?: WpscanVulnerability[];
};

type WpscanReport = {
  version?: WpscanComponent;
  main_theme?: WpscanComponent & { slug?: string };
  plugins?: Record<string, WpscanComponent>;
  themes?: Record<string, WpscanComponent>;
};

export const wpscanScanner: Scanner = {
  name: 'wpscan',
  category: 'security',

  supports: (t: RecipeTarget): boolean => {
    if (t.type === 'url') return true;
    // wpscan needs a live URL — code targets cannot be scanned.
    return false;
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];

    const baseArgs = [
      '--url',
      target.url,
      '--format',
      'json',
      '--no-update',
      '--random-user-agent',
      '--disable-tls-checks',
    ];
    const apiToken = process.env.WPSCAN_API_TOKEN;
    if (apiToken) baseArgs.push('--api-token', apiToken);

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'wpscan',
        localArgs: baseArgs,
        docker: {
          image: 'wpscanteam/wpscan:latest',
          args: baseArgs,
          network: 'host',
          ...(apiToken ? { env: { WPSCAN_API_TOKEN: apiToken } } : {}),
        },
        // wpscan exit codes: 0 ok, 4 vulns found, 5 warnings.
        exec: { okExitCodes: [0, 4, 5], timeoutMs: 10 * 60_000 },
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parseWpscanJson(stdout, target.id);
  },
};

function severityFor(v: WpscanVulnerability): Severity {
  const hasCve = !!v.references?.cve?.length;
  const hasFix = !!v.fixed_in;
  if (hasCve && hasFix) return 'high';
  return 'medium';
}

function extractCwe(v: WpscanVulnerability): string | undefined {
  const urls = v.references?.url ?? [];
  for (const u of urls) {
    const m = u.match(/CWE[-_]?(\d+)/i);
    if (m) return `CWE-${m[1]}`;
  }
  return undefined;
}

function pushVulns(
  out: Finding[],
  targetId: string,
  source: string,
  vulns: WpscanVulnerability[] | undefined,
): void {
  if (!vulns?.length) return;
  for (const v of vulns) {
    const cve = v.references?.cve?.[0];
    const cwe = extractCwe(v);
    const fix = v.fixed_in ? ` (corrigé en ${v.fixed_in})` : ' (aucun correctif disponible)';
    const cveTag = cve ? ` [CVE-${cve}]` : '';
    out.push({
      scanner: 'wpscan',
      category: 'security',
      severity: severityFor(v),
      target: targetId,
      rule: cve ? `CVE-${cve}` : 'wpscan',
      ...(cwe ? { cwe } : {}),
      message: `${source}: ${v.title ?? 'Vulnérabilité inconnue'}${cveTag}${fix}`,
      raw: v,
    });
  }
}

/** Parses wpscan JSON output into Finding objects. */
export function parseWpscanJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie wpscan invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as WpscanReport;
  if (!report || typeof report !== 'object') return [];

  const findings: Finding[] = [];

  pushVulns(findings, targetId, 'WordPress core', report.version?.vulnerabilities);

  if (report.main_theme) {
    const slug = report.main_theme.slug ?? 'main_theme';
    pushVulns(findings, targetId, `Thème ${slug}`, report.main_theme.vulnerabilities);
  }

  for (const [name, plugin] of Object.entries(report.plugins ?? {})) {
    pushVulns(findings, targetId, `Plugin ${name}`, plugin.vulnerabilities);
  }
  for (const [name, theme] of Object.entries(report.themes ?? {})) {
    pushVulns(findings, targetId, `Thème ${name}`, theme.vulnerabilities);
  }

  return findings;
}
