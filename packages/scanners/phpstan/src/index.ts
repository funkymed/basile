import path from 'node:path';
import { execHybrid, ExecError, type Finding, type RecipeTarget } from '@basile/core';
import type { Scanner } from '@basile/runner';

type PhpstanMessage = {
  message: string;
  line?: number;
  identifier?: string;
  ignorable?: boolean;
};

type PhpstanReport = {
  files?: Record<string, { messages?: PhpstanMessage[] }>;
  errors?: string[];
};

const SUPPORTED_STACKS = new Set(['php', 'symfony']);

export const phpstanScanner: Scanner = {
  name: 'phpstan',
  category: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'phpstan',
        localArgs: ['analyse', target.path, '--error-format=json', '--no-progress'],
        docker: {
          image: 'ghcr.io/phpstan/phpstan:latest',
          args: ['analyse', '/app', '--error-format=json', '--no-progress'],
          volumes: [{ host: target.path, container: '/app', readonly: true }],
          workdir: '/app',
        },
        // PHPStan exits 1 when findings are produced.
        exec: { okExitCodes: [0, 1] },
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        // Tolerate non-zero exit codes when JSON is present on stdout.
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parsePhpstanJson(stdout, target.id, target.path);
  },
};

/** Parses PHPStan JSON output into Finding objects. */
export function parsePhpstanJson(json: string, targetId: string, rootPath: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie PHPStan invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as PhpstanReport;
  if (!report || typeof report !== 'object' || !report.files) return [];

  const findings: Finding[] = [];
  const root = path.resolve(rootPath);

  for (const [filePath, entry] of Object.entries(report.files)) {
    const messages = entry.messages ?? [];
    // Strip docker mount prefix when present.
    const normalized = filePath.startsWith('/app/') ? filePath.slice('/app/'.length) : filePath;
    const rel =
      path.isAbsolute(normalized) && normalized.startsWith(root)
        ? path.relative(root, normalized)
        : normalized;
    for (const msg of messages) {
      findings.push({
        scanner: 'phpstan',
        category: 'quality',
        severity: 'high',
        target: targetId,
        file: rel,
        ...(msg.line !== undefined ? { line: msg.line } : {}),
        rule: msg.identifier ?? 'phpstan',
        message: msg.message,
        raw: msg,
      });
    }
  }
  return findings;
}
