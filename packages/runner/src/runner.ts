import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { Listr } from 'listr2';
import type { Finding, Recipe, RecipeTarget } from '@basile/core';
import type { ScannerRegistry } from './registry.js';
import type { ScanResult } from './types.js';

export type UiMode = 'pretty' | 'plain' | 'json' | 'quiet';

export type RunScanOptions = {
  outDir: string;
  ui: UiMode;
  signal?: AbortSignal;
};

export type RunScanResult = {
  findings: Finding[];
  results: ScanResult[];
  gaps: string[];
};

type Ctx = {
  results: ScanResult[];
  findings: Finding[];
  gaps: string[];
};

function targetIdentifier(target: RecipeTarget): string {
  if (target.type === 'code') return `${target.id} (${target.path})`;
  if (target.type === 'domain') return `${target.id} (${target.domain})`;
  return `${target.id} (${target.url})`;
}

function targetSlug(target: RecipeTarget): string {
  return target.id.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function rendererFor(ui: UiMode): 'default' | 'silent' | 'verbose' {
  if (ui === 'pretty') return 'default';
  if (ui === 'plain') return 'verbose';
  return 'silent';
}

/**
 * Orchestrates scanners across all recipe targets.
 * Writes raw outputs to outDir/raw and aggregated findings to outDir/findings.ndjson.
 */
export async function runScan(
  recipe: Recipe,
  registry: ScannerRegistry,
  opts: RunScanOptions,
): Promise<RunScanResult> {
  const { outDir, ui } = opts;
  await mkdir(path.join(outDir, 'raw'), { recursive: true });

  const ndjsonPath = path.join(outDir, 'findings.ndjson');
  await writeFile(ndjsonPath, '');

  const ctx: Ctx = { results: [], findings: [], gaps: [] };

  // Identify gaps up-front (declared scanners not in registry).
  for (const target of recipe.targets) {
    for (const missing of registry.missingForTarget(target)) {
      ctx.gaps.push(`${target.id}:${missing}`);
    }
  }

  const tasks = new Listr<Ctx>(
    recipe.targets.map((target) => ({
      title: `Target ${targetIdentifier(target)}`,
      task: (_, parent) => {
        const scanners = registry.resolveForTarget(target);
        if (scanners.length === 0) {
          return parent.newListr([
            {
              title: 'No applicable scanner',
              task: () => {
                /* no-op */
              },
            },
          ]);
        }
        return parent.newListr(
          scanners.map((scanner) => ({
            title: `Scanner ${scanner.name}`,
            task: async (innerCtx, sub) => {
              const start = Date.now();
              const targetId = target.id;
              const mode: ScanResult['mode'] = 'local';
              try {
                const findings = await scanner.run(target, { outDir, ...(opts.signal ? { signal: opts.signal } : {}) });
                const durationMs = Date.now() - start;
                const result: ScanResult = {
                  target: targetId,
                  scanner: scanner.name,
                  findings,
                  durationMs,
                  mode,
                };
                innerCtx.results.push(result);
                innerCtx.findings.push(...findings);

                const rawPath = path.join(outDir, 'raw', `${targetSlug(target)}-${scanner.name}.json`);
                await writeFile(rawPath, JSON.stringify(findings, null, 2));
                if (findings.length > 0) {
                  await appendFile(
                    ndjsonPath,
                    findings.map((f) => JSON.stringify(f)).join('\n') + '\n',
                  );
                }
                sub.title = `Scanner ${scanner.name} (${findings.length} findings, ${durationMs}ms)`;
              } catch (err) {
                const durationMs = Date.now() - start;
                const message = err instanceof Error ? err.message : String(err);
                const result: ScanResult = {
                  target: targetId,
                  scanner: scanner.name,
                  findings: [],
                  durationMs,
                  mode,
                  error: message,
                };
                innerCtx.results.push(result);
                sub.title = `Scanner ${scanner.name} ECHEC: ${message.slice(0, 80)}`;
                // Do not rethrow: other scanners must continue.
              }
            },
          })),
          { concurrent: recipe.parallel, exitOnError: false },
        );
      },
    })),
    {
      concurrent: recipe.parallel,
      exitOnError: false,
      renderer: rendererFor(ui) as 'default',
    },
  );

  await tasks.run(ctx);

  if (ui === 'json') {
    // Emit a single JSON summary on stdout for machine consumption.
    process.stdout.write(
      JSON.stringify({ findings: ctx.findings, results: ctx.results, gaps: ctx.gaps }) + '\n',
    );
  }

  return { findings: ctx.findings, results: ctx.results, gaps: ctx.gaps };
}
