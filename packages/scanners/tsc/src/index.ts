import path from 'node:path';
import { existsSync } from 'node:fs';
import { exec, ExecError, which, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

const SUPPORTED_STACKS = new Set(['typescript', 'react', 'nodejs']);
const TSC_LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

export const tscScanner: Scanner = {
  name: 'tsc',
  category: 'quality',
  profile: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('tsc')) {
      throw new Error('Binary "tsc" not found. Install TypeScript globally (npm i -g typescript).');
    }
    const tsconfig = path.join(target.path, 'tsconfig.json');
    if (!existsSync(tsconfig)) {
      return [
        {
          scanner: 'tsc',
          category: 'quality',
          severity: 'info',
          target: target.id,
          message: 'No tsconfig.json found — tsc analysis skipped.',
        },
      ];
    }
    const cmd = ['tsc', '--noEmit', '--pretty', 'false', '-p', tsconfig];
    let stdout: string;
    try {
      const r = await exec(cmd, { okExitCodes: [0, 1, 2], timeoutMs: 10 * 60_000, cwd: target.path });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError) {
        stdout = err.result.stdout;
        if (!stdout) throw err;
      } else {
        throw err;
      }
    }
    return parseTscOutput(stdout, target.id, target.path);
  },
};

/** Parses tsc text output into Finding objects. */
export function parseTscOutput(out: string, targetId: string, rootPath: string): Finding[] {
  const findings: Finding[] = [];
  const root = path.resolve(rootPath);
  const lines = out.split(/\r?\n/);
  for (const line of lines) {
    const m = TSC_LINE_RE.exec(line);
    if (!m) continue;
    const [, filePath, lineNo, , kind, code, message] = m;
    if (!filePath || !code || !message) continue;
    const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const rel = path.relative(root, abs) || path.basename(abs);
    const severity: Severity = kind === 'error' ? 'high' : 'medium';
    findings.push({
      scanner: 'tsc',
      category: 'quality',
      severity,
      target: targetId,
      file: rel,
      line: Number(lineNo),
      rule: code,
      message,
    });
  }
  return findings;
}
