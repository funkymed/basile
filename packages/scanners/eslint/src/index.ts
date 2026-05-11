import path from 'node:path';
import { exec, ExecError, which, mergeExcludes, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

/** ESLint native JSON output element. */
type EslintFileResult = {
  filePath: string;
  messages: Array<{
    ruleId: string | null;
    severity: 1 | 2;
    message: string;
    line?: number;
    column?: number;
  }>;
};

const SUPPORTED_STACKS = new Set(['typescript', 'react', 'nodejs']);

export const eslintScanner: Scanner = {
  name: 'eslint',
  category: 'quality',
  profile: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('eslint')) {
      throw new Error('Binaire "eslint" introuvable. Installer ESLint avant exécution.');
    }
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    const ignoreArgs = excludes.flatMap((e) => ['--ignore-pattern', `**/${e}/**`]);
    const cmd = ['eslint', target.path, '--format=json', ...ignoreArgs];
    let stdout: string;
    try {
      const r = await exec(cmd, { okExitCodes: [0, 1, 2] });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError) {
        // ESLint may print JSON to stdout even on lint errors; tolerate it.
        stdout = err.result.stdout;
        if (!stdout) throw err;
      } else {
        throw err;
      }
    }
    return parseEslintJson(stdout, target.id, target.path);
  },
};

/** Parses ESLint JSON output into Finding objects relative to the target root. */
export function parseEslintJson(json: string, targetId: string, rootPath: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie ESLint invalide (JSON parse): ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) return [];
  const results = parsed as EslintFileResult[];
  const findings: Finding[] = [];
  const root = path.resolve(rootPath);

  for (const file of results) {
    if (!file?.messages?.length) continue;
    const rel = path.relative(root, file.filePath) || path.basename(file.filePath);
    for (const msg of file.messages) {
      const severity: Severity = msg.severity === 2 ? 'high' : 'low';
      findings.push({
        scanner: 'eslint',
        category: 'quality',
        severity,
        target: targetId,
        file: rel,
        ...(msg.line !== undefined ? { line: msg.line } : {}),
        ...(msg.ruleId ? { rule: msg.ruleId } : {}),
        message: msg.message,
        raw: msg,
      });
    }
  }
  return findings;
}
