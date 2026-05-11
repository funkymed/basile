import { execHybrid, ExecError, mergeExcludes, type Category, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type BearerFinding = {
  id?: string;
  title?: string;
  description?: string;
  cwe_ids?: string[];
  owasp_top10?: string[];
  filename?: string;
  full_filename?: string;
  line_number?: number;
};

type BearerReport = {
  critical?: BearerFinding[];
  high?: BearerFinding[];
  medium?: BearerFinding[];
  low?: BearerFinding[];
  warning?: BearerFinding[];
};

const SUPPORTED_STACKS = new Set(['php', 'symfony', 'typescript', 'react', 'nodejs']);

export const bearerScanner: Scanner = {
  name: 'bearer',
  category: 'privacy',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    const skip = `--skip-path=${excludes.join(',')}`;
    const localArgs = ['scan', target.path, '--format=json', '--quiet', '--no-color', skip];
    const dockerArgs = ['scan', '/tmp/scan', '--format=json', '--quiet', '--no-color', skip];

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'bearer',
        localArgs,
        docker: {
          image: 'bearer/bearer:latest-amd64',
          args: dockerArgs,
          volumes: [{ host: target.path, container: '/tmp/scan', readonly: true }],
          workdir: '/tmp/scan',
        },
        exec: { okExitCodes: [0, 1], timeoutMs: 15 * 60_000 },
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parseBearerJson(stdout, target.id);
  },
};

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  warning: 'low',
};

export function parseBearerJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Bearer invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as BearerReport;
  const findings: Finding[] = [];
  for (const key of Object.keys(SEVERITY_MAP)) {
    const arr = (report as Record<string, BearerFinding[] | undefined>)[key];
    if (!Array.isArray(arr)) continue;
    const sev = SEVERITY_MAP[key]!;
    for (const f of arr) {
      const category: Category = sev === 'low' ? 'privacy' : 'privacy';
      const finding: Finding = {
        scanner: 'bearer',
        category,
        severity: sev,
        target: targetId,
        message: f.title ?? f.description ?? f.id ?? 'bearer finding',
        raw: f,
      };
      if (f.id) finding.rule = f.id;
      if (f.filename) finding.file = f.filename;
      if (f.line_number !== undefined) finding.line = f.line_number;
      if (f.cwe_ids && f.cwe_ids[0]) finding.cwe = f.cwe_ids[0];
      if (f.owasp_top10 && f.owasp_top10[0]) finding.owasp = f.owasp_top10[0];
      findings.push(finding);
    }
  }
  return findings;
}
