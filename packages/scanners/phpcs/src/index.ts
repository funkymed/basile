import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  execHybrid,
  ExecError,
  mergeExcludes,
  type Finding,
  type RecipeTarget,
  type Severity,
} from '@basile/core';
import type { Scanner } from '@basile/runner';

type PhpcsMessage = {
  message: string;
  source?: string;
  severity?: number;
  type?: 'ERROR' | 'WARNING';
  line?: number;
  column?: number;
};

type PhpcsReport = {
  files?: Record<string, { messages?: PhpcsMessage[] }>;
};

const SUPPORTED_STACKS = new Set(['php', 'symfony', 'wordpress']);

export const phpcsScanner: Scanner = {
  name: 'phpcs',
  category: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];

    const standard = resolveStandard(target.path, target.stacks);
    const excludes = mergeExcludes(target.exclude_paths ?? []);
    // phpcs --ignore takes a comma-separated list of patterns (paths or globs).
    const ignorePatterns = excludes.flatMap((e) => [`*/${e}/*`, `${e}/*`]).join(',');

    const commonArgs = ['--report=json', `--standard=${standard}`, `--ignore=${ignorePatterns}`];

    // Local: scan absolute path.
    const localArgs = [...commonArgs, target.path];

    // Docker: target.path is mounted at /app.
    const dockerArgs = [...commonArgs, '.'];

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'phpcs',
        localArgs,
        docker: {
          image: 'cytopia/phpcs:latest',
          args: dockerArgs,
          volumes: [{ host: target.path, container: '/app', readonly: true }],
          workdir: '/app',
        },
        // phpcs returns >0 when issues found.
        exec: { okExitCodes: [0, 1, 2], timeoutMs: 5 * 60_000 },
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parsePhpcsJson(stdout, target.id, target.path);
  },
};

/**
 * Picks the PHPCS coding standard:
 *  1. Local phpcs.xml(.dist) → use that file
 *  2. Stack contains wordpress → "WordPress" (caller responsible for image with ruleset)
 *  3. Default → PSR12
 */
function resolveStandard(rootPath: string, stacks: readonly string[]): string {
  for (const cfg of ['phpcs.xml', 'phpcs.xml.dist']) {
    if (existsSync(path.join(rootPath, cfg))) return cfg;
  }
  if (stacks.includes('wordpress')) return 'PSR12';
  return 'PSR12';
}

/** Parses PHPCS JSON output into Finding objects relative to the target root. */
export function parsePhpcsJson(json: string, targetId: string, rootPath: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie PHPCS invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as PhpcsReport;
  if (!report || typeof report !== 'object' || !report.files) return [];

  const findings: Finding[] = [];
  const root = path.resolve(rootPath);

  for (const [filePath, entry] of Object.entries(report.files)) {
    const messages = entry.messages ?? [];
    const normalized = filePath.startsWith('/app/') ? filePath.slice('/app/'.length) : filePath;
    const rel =
      path.isAbsolute(normalized) && normalized.startsWith(root)
        ? path.relative(root, normalized)
        : normalized;
    for (const msg of messages) {
      const severity: Severity = msg.type === 'ERROR' ? 'high' : 'medium';
      findings.push({
        scanner: 'phpcs',
        category: 'quality',
        severity,
        target: targetId,
        file: rel,
        ...(msg.line !== undefined ? { line: msg.line } : {}),
        ...(msg.source ? { rule: msg.source } : { rule: 'phpcs' }),
        message: msg.message,
        raw: msg,
      });
    }
  }
  return findings;
}
