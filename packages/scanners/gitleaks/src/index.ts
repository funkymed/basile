import { execHybrid, ExecError, mergeExcludes, type Finding, type RecipeTarget } from '@basile/core';
import type { Scanner } from '@basile/runner';

type GitleaksLeak = {
  Description?: string;
  StartLine?: number;
  EndLine?: number;
  File?: string;
  Match?: string;
  Secret?: string;
  RuleID?: string;
  Tags?: string[];
};

export const gitleaksScanner: Scanner = {
  name: 'gitleaks',
  category: 'secrets',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'code',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    const localArgs = [
      'detect',
      `--source=${target.path}`,
      '--report-format=json',
      '--report-path=/dev/stdout',
      '--no-banner',
      '--no-git',
    ];
    const dockerArgs = [
      'detect',
      '--source=/repo',
      '--report-format=json',
      '--report-path=/dev/stdout',
      '--no-banner',
      '--no-git',
    ];

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'gitleaks',
        localArgs,
        docker: {
          image: 'zricethezav/gitleaks:latest',
          args: dockerArgs,
          volumes: [{ host: target.path, container: '/repo', readonly: true }],
          workdir: '/repo',
        },
        exec: { okExitCodes: [0, 1], timeoutMs: 5 * 60_000 },
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    const all = parseGitleaksJson(stdout, target.id);
    // gitleaks v8 has no native --exclude-paths flag; filter post-hoc.
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    return all.filter((f) => !f.file || !excludes.some((e) => f.file!.includes(`/${e}/`) || f.file!.startsWith(`${e}/`) || f.file === e));
  },
};

export function parseGitleaksJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  // gitleaks may emit banner/log lines before JSON; try to locate the array.
  const start = trimmed.indexOf('[');
  if (start < 0) return [];
  const slice = trimmed.slice(start);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (e) {
    throw new Error(`Sortie Gitleaks invalide (JSON parse): ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) return [];
  const leaks = parsed as GitleaksLeak[];
  return leaks.map((l) => {
    const finding: Finding = {
      scanner: 'gitleaks',
      category: 'secrets',
      severity: 'critical',
      target: targetId,
      message: l.Description ?? l.RuleID ?? 'Secret détecté',
      raw: l,
    };
    if (l.File) finding.file = l.File;
    if (l.StartLine !== undefined) finding.line = l.StartLine;
    if (l.RuleID) finding.rule = l.RuleID;
    return finding;
  });
}
