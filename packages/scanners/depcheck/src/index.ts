import { exec, ExecError, which, mergeExcludes, type Finding, type RecipeTarget } from '@basile/core';
import type { Scanner } from '@basile/runner';

const SUPPORTED_STACKS = new Set(['typescript', 'react', 'nodejs']);

type DepcheckReport = {
  dependencies?: string[];
  devDependencies?: string[];
  missing?: Record<string, string[]>;
  using?: Record<string, string[]>;
};

export const depcheckScanner: Scanner = {
  name: 'depcheck',
  category: 'deps',
  profile: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('depcheck')) {
      throw new Error('Binary "depcheck" not found. Install Depcheck globally (npm i -g depcheck).');
    }
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    const cmd = ['depcheck', '--json', `--ignore-dirs=${excludes.join(',')}`];
    let stdout: string;
    try {
      const r = await exec(cmd, {
        okExitCodes: [-1, 0, 255, 1],
        cwd: target.path,
        timeoutMs: 10 * 60_000,
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parseDepcheckJson(stdout, target.id);
  },
};

/** Parses depcheck JSON output into Finding objects. */
export function parseDepcheckJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Depcheck invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as DepcheckReport;
  if (!report || typeof report !== 'object') return [];
  const findings: Finding[] = [];

  for (const name of report.dependencies ?? []) {
    findings.push({
      scanner: 'depcheck',
      category: 'deps',
      severity: 'medium',
      target: targetId,
      file: 'package.json',
      rule: 'depcheck-unused',
      message: `Unused prod dependency: ${name}`,
    });
  }
  for (const name of report.devDependencies ?? []) {
    findings.push({
      scanner: 'depcheck',
      category: 'deps',
      severity: 'low',
      target: targetId,
      file: 'package.json',
      rule: 'depcheck-unused',
      message: `Unused dev dependency: ${name}`,
    });
  }
  for (const name of Object.keys(report.missing ?? {})) {
    findings.push({
      scanner: 'depcheck',
      category: 'deps',
      severity: 'high',
      target: targetId,
      file: 'package.json',
      rule: 'depcheck-missing',
      message: `Missing dependency: ${name}`,
    });
  }
  return findings;
}
