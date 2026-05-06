import { execHybrid, ExecError, mergeExcludes, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type SemgrepResult = {
  check_id: string;
  path: string;
  start?: { line?: number; col?: number };
  end?: { line?: number; col?: number };
  extra?: {
    message?: string;
    severity?: string;
    metadata?: { cwe?: string | string[]; owasp?: string | string[] };
  };
};

type SemgrepReport = {
  results?: SemgrepResult[];
};

const SUPPORTED_STACKS = new Set(['php', 'symfony', 'typescript', 'react', 'nodejs', 'wordpress']);

export const semgrepScanner: Scanner = {
  name: 'semgrep',
  category: 'security',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    const excludeArgs = excludes.flatMap((e) => ['--exclude', e]);
    const localArgs = ['scan', '--config=auto', '--json', '--quiet', ...excludeArgs, target.path];
    const dockerArgs = ['scan', '--config=auto', '--json', '--quiet', ...excludeArgs, '/src'];

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'semgrep',
        localArgs,
        docker: {
          image: 'returntocorp/semgrep:latest',
          args: dockerArgs,
          volumes: [{ host: target.path, container: '/src', readonly: true }],
          workdir: '/src',
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
    return parseSemgrepJson(stdout, target.id, target.path);
  },
};

function mapSeverity(s: string | undefined): Severity {
  switch ((s ?? '').toUpperCase()) {
    case 'ERROR':
      return 'high';
    case 'WARNING':
      return 'medium';
    case 'INFO':
      return 'low';
    default:
      return 'low';
  }
}

function firstStr(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function parseSemgrepJson(json: string, targetId: string, rootPath: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Semgrep invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as SemgrepReport;
  const results = report.results ?? [];
  const findings: Finding[] = [];
  for (const r of results) {
    const meta = r.extra?.metadata ?? {};
    const file = r.path.startsWith('/src/')
      ? r.path.slice('/src/'.length)
      : r.path.startsWith(rootPath)
        ? r.path.slice(rootPath.length).replace(/^\/+/, '')
        : r.path;
    const finding: Finding = {
      scanner: 'semgrep',
      category: 'security',
      severity: mapSeverity(r.extra?.severity),
      target: targetId,
      file,
      rule: r.check_id,
      message: r.extra?.message ?? r.check_id,
      raw: r,
    };
    if (r.start?.line !== undefined) finding.line = r.start.line;
    const cwe = firstStr(meta.cwe);
    if (cwe) finding.cwe = cwe;
    const owasp = firstStr(meta.owasp);
    if (owasp) finding.owasp = owasp;
    findings.push(finding);
  }
  return findings;
}
