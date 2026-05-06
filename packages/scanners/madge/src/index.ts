import { exec, ExecError, which, mergeExcludes, type Finding, type RecipeTarget } from '@basile/core';
import type { Scanner } from '@basile/runner';

const SUPPORTED_STACKS = new Set(['typescript', 'react', 'nodejs']);

export const madgeScanner: Scanner = {
  name: 'madge',
  category: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('madge')) {
      throw new Error('Binaire "madge" introuvable. Installer Madge globalement (npm i -g madge).');
    }
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    // madge --exclude takes a regex; build alternation of escaped dir names.
    const escaped = excludes.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const excludeRegex = `(?:^|/)(${escaped.join('|')})(?:/|$)`;
    const cmd = ['madge', '--circular', '--json', '--exclude', excludeRegex, target.path];
    let stdout: string;
    try {
      const r = await exec(cmd, { okExitCodes: [0, 1], timeoutMs: 10 * 60_000 });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parseMadgeJson(stdout, target.id);
  },
};

/** Parses madge JSON cycles output into Finding objects. */
export function parseMadgeJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Madge invalide (JSON parse): ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) return [];
  const findings: Finding[] = [];
  for (const cycle of parsed) {
    if (!Array.isArray(cycle) || cycle.length === 0) continue;
    const first = cycle[0];
    if (typeof first !== 'string') continue;
    findings.push({
      scanner: 'madge',
      category: 'quality',
      severity: 'medium',
      target: targetId,
      file: first,
      rule: 'madge-cycle',
      message: `Cycle d'import: ${cycle.join(' → ')} → ${first}`,
    });
  }
  return findings;
}
