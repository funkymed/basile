import { exec, which, mergeExcludes, type Finding, type RecipeTarget } from '@basile/core';
import type { Scanner } from '@basile/runner';

type ClocLangStats = { nFiles?: number; blank?: number; comment?: number; code?: number };
type ClocReport = Record<string, ClocLangStats | unknown> & {
  SUM?: ClocLangStats;
  header?: unknown;
};

export const clocScanner: Scanner = {
  name: 'cloc',
  category: 'quality',
  profile: 'quality',

  supports: (t: RecipeTarget): boolean => t.type === 'code',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('cloc')) {
      throw new Error('Binary "cloc" not found. Install cloc.');
    }
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    // cloc `--exclude-dir` n'accepte que des basenames (pas de slashes).
    // Multi-segment paths (var/cache, bootstrap/cache, public/build…) feraient
    // crasher cloc avec exit 2. On les filtre — perte minimale (LOC count, pas
    // critique pour rapport sécurité). Alternative `--fullpath --not-match-d=REGEX`
    // requiert Perl Regexp::Common pas dispo partout.
    const dirOnly = excludes.filter((p) => !p.includes('/'));
    const args = ['cloc', '--json'];
    if (dirOnly.length > 0) {
      args.push(`--exclude-dir=${dirOnly.join(',')}`);
    }
    args.push(target.path);
    const r = await exec(args, { okExitCodes: [0], timeoutMs: 2 * 60_000 });
    return parseClocJson(r.stdout, target.id);
  },
};

export function parseClocJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie cloc invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as ClocReport;
  const sum = report.SUM as ClocLangStats | undefined;
  if (!sum) return [];
  const files = sum.nFiles ?? 0;
  const code = sum.code ?? 0;
  const comments = sum.comment ?? 0;
  const blanks = sum.blank ?? 0;

  // Per-language stats stripped of header/SUM.
  const byLang: Record<string, ClocLangStats> = {};
  for (const [k, v] of Object.entries(report)) {
    if (k === 'SUM' || k === 'header') continue;
    byLang[k] = v as ClocLangStats;
  }

  return [
    {
      scanner: 'cloc',
      category: 'quality',
      severity: 'info',
      target: targetId,
      rule: 'cloc-stats',
      message: `${files} fichiers, ${code} lignes de code, ${comments} commentaires, ${blanks} lignes vides`,
      raw: byLang,
    },
  ];
}
