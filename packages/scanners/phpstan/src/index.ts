import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
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

    // Detect config + analysis path to avoid PHPStan hanging on huge codebases
    // without configuration (which would scan vendor/, var/, etc.).
    const { analysisPath, configRel } = resolveAnalysisScope(target.path);

    const commonArgs = [
      '--error-format=json',
      '--no-progress',
      '--no-interaction',
      '--memory-limit=2G',
    ];
    const configArg = configRel ? [`--configuration=${configRel}`] : ['--level=5'];

    // Local: pass absolute paths.
    const localArgs = ['analyse', analysisPath, ...commonArgs, ...configArg];

    // Docker: target.path is mounted at /app. Translate analysisPath to container path.
    const containerAnalysisPath =
      analysisPath === target.path ? '.' : path.relative(target.path, analysisPath);
    const dockerArgs = ['analyse', containerAnalysisPath, ...commonArgs, ...configArg];

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'phpstan',
        localArgs,
        docker: {
          image: 'ghcr.io/phpstan/phpstan:latest',
          args: dockerArgs,
          volumes: [{ host: target.path, container: '/app', readonly: true }],
          workdir: '/app',
        },
        // PHPStan exits 1 when findings are produced; 2 when fatal error.
        exec: { okExitCodes: [0, 1], timeoutMs: 15 * 60_000 },
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

/**
 * Pick the smallest sensible analysis scope to avoid PHPStan stalling on huge
 * unscoped projects (vendor/, var/, node_modules/, etc.).
 *
 * Order:
 *  1. If phpstan.neon[.dist] exists at root → use it, scan target.path
 *  2. Else if src/ exists → scan src/ at level 5 (no config)
 *  3. Else → scan target.path at level 5
 */
function resolveAnalysisScope(rootPath: string): { analysisPath: string; configRel: string | null } {
  const root = path.resolve(rootPath);
  for (const cfg of ['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon']) {
    if (existsSync(path.join(root, cfg))) {
      return { analysisPath: rootPath, configRel: cfg };
    }
  }
  const src = path.join(root, 'src');
  if (existsSync(src) && statSync(src).isDirectory()) {
    return { analysisPath: src, configRel: null };
  }
  return { analysisPath: rootPath, configRel: null };
}

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
