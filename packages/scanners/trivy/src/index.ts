import { execHybrid, mergeExcludes, type Category, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type TrivyVuln = {
  VulnerabilityID?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
  CweIDs?: string[];
};

type TrivySecret = {
  RuleID?: string;
  Severity?: string;
  Title?: string;
  StartLine?: number;
  Match?: string;
};

type TrivyMisconfig = {
  ID?: string;
  AVDID?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
};

type TrivyResult = {
  Target?: string;
  Type?: string;
  Vulnerabilities?: TrivyVuln[];
  Secrets?: TrivySecret[];
  Misconfigurations?: TrivyMisconfig[];
};

type TrivyReport = { Results?: TrivyResult[] };

export const trivyScanner: Scanner = {
  name: 'trivy',
  category: 'security',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'code',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    const skipDirs = `--skip-dirs=${excludes.join(',')}`;
    const localArgs = [
      'fs',
      '--format=json',
      '--quiet',
      '--scanners=vuln,secret,misconfig',
      skipDirs,
      target.path,
    ];
    const dockerArgs = [
      'fs',
      '--format=json',
      '--quiet',
      '--scanners=vuln,secret,misconfig',
      skipDirs,
      '/src',
    ];

    const r = await execHybrid({
      localBin: 'trivy',
      localArgs,
      docker: {
        image: 'aquasec/trivy:latest',
        args: dockerArgs,
        volumes: [{ host: target.path, container: '/src', readonly: true }],
        workdir: '/src',
      },
      exec: { okExitCodes: [0], timeoutMs: 15 * 60_000 },
    });
    return parseTrivyJson(r.stdout, target.id);
  },
};

function mapSeverity(s: string | undefined): Severity {
  switch ((s ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      return 'info';
  }
}

export function parseTrivyJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Trivy invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as TrivyReport;
  const results = report.Results ?? [];
  const findings: Finding[] = [];

  for (const res of results) {
    const file = res.Target;
    for (const v of res.Vulnerabilities ?? []) {
      const f: Finding = {
        scanner: 'trivy',
        category: 'deps' as Category,
        severity: mapSeverity(v.Severity),
        target: targetId,
        message: `${v.VulnerabilityID ?? ''} ${v.PkgName ?? ''}@${v.InstalledVersion ?? ''}: ${v.Title ?? ''}`.trim(),
        raw: v,
      };
      if (file) f.file = file;
      if (v.VulnerabilityID) f.rule = v.VulnerabilityID;
      if (v.CweIDs && v.CweIDs[0]) f.cwe = v.CweIDs[0];
      findings.push(f);
    }
    for (const s of res.Secrets ?? []) {
      const f: Finding = {
        scanner: 'trivy',
        category: 'secrets',
        severity: mapSeverity(s.Severity),
        target: targetId,
        message: s.Title ?? s.RuleID ?? 'Secret détecté',
        raw: s,
      };
      if (file) f.file = file;
      if (s.StartLine !== undefined) f.line = s.StartLine;
      if (s.RuleID) f.rule = s.RuleID;
      findings.push(f);
    }
    for (const m of res.Misconfigurations ?? []) {
      const f: Finding = {
        scanner: 'trivy',
        category: 'security',
        severity: mapSeverity(m.Severity),
        target: targetId,
        message: m.Title ?? m.Description ?? m.ID ?? 'Misconfiguration',
        raw: m,
      };
      if (file) f.file = file;
      if (m.ID || m.AVDID) f.rule = m.ID ?? m.AVDID!;
      findings.push(f);
    }
  }
  return findings;
}
