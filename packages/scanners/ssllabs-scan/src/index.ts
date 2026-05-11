import { exec, which, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type SslLabsEndpoint = {
  ipAddress?: string;
  grade?: string;
  statusMessage?: string;
  hasWarnings?: boolean;
};

type SslLabsReport = {
  host?: string;
  status?: string;
  endpoints?: SslLabsEndpoint[];
};

export const ssllabsScanner: Scanner = {
  name: 'ssllabs-scan',
  category: 'security',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!which('ssllabs-scan')) {
      throw new Error('Binaire "ssllabs-scan" introuvable.');
    }
    const host = new URL(target.url).hostname;
    const r = await exec(['ssllabs-scan', '-quiet', '-usecache', host], {
      okExitCodes: [0],
      timeoutMs: 5 * 60_000,
    });
    return parseSslLabsJson(r.stdout, target.id);
  },
};

function gradeSeverity(grade: string | undefined): Severity {
  const g = (grade ?? '').toUpperCase();
  if (g === 'A' || g === 'A+' || g === 'A-') return 'info';
  if (g === 'B') return 'medium';
  if (g === 'C') return 'high';
  if (g === 'D' || g === 'E' || g === 'F' || g === 'T' || g === 'M') return 'critical';
  return 'low';
}

export function parseSslLabsJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie ssllabs-scan invalide (JSON parse): ${(e as Error).message}`);
  }
  // ssllabs-scan returns an array of host reports.
  const reports: SslLabsReport[] = Array.isArray(parsed)
    ? (parsed as SslLabsReport[])
    : [parsed as SslLabsReport];

  const findings: Finding[] = [];
  for (const report of reports) {
    for (const ep of report.endpoints ?? []) {
      const grade = ep.grade ?? 'unknown';
      const sev = gradeSeverity(grade);
      findings.push({
        scanner: 'ssllabs-scan',
        category: 'security',
        severity: sev,
        target: targetId,
        rule: `ssllabs-grade-${grade}`,
        message: `Grade ${grade} sur ${ep.ipAddress ?? '?'}: ${ep.statusMessage ?? ''}`.trim(),
        raw: ep,
      });
    }
  }
  return findings;
}
