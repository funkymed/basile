import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import type { Finding, Recipe } from '@basile/core';
import { listScannersInRecipe } from '@basile/core';
import { aggregate } from './aggregate.js';
import { registerHelpers } from './helpers.js';
import type { CoverageGap, ReportContext, ReportSummary, RunMeta } from './types.js';

const templateCache = new Map<string, HandlebarsTemplateDelegate>();
let helpersRegistered = false;

function ensureHelpers(): void {
  if (!helpersRegistered) {
    registerHelpers(Handlebars, 'markdown');
    helpersRegistered = true;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the templates directory by walking upwards from this module's
 * location until a `templates/` folder is found.
 */
async function findTemplatesDir(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'templates');
    if (await exists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Templates directory not found (walked up from ${here})`);
}

export async function loadTemplate(name: string): Promise<HandlebarsTemplateDelegate> {
  ensureHelpers();
  const cached = templateCache.get(name);
  if (cached) return cached;
  const dir = await findTemplatesDir();
  const filePath = path.join(dir, `${name}.hbs`);
  const raw = await readFile(filePath, 'utf8');
  const compiled = Handlebars.compile(raw, { noEscape: true });
  templateCache.set(name, compiled);
  return compiled;
}

export function clearTemplateCache(): void {
  templateCache.clear();
}

export async function renderReport(template: string, ctx: ReportContext): Promise<string> {
  const tpl = await loadTemplate(template);
  return tpl(ctx);
}

export type WriteReportOptions = {
  template?: string;
  runMeta?: Partial<RunMeta>;
  scoreThreshold?: number;
  warnThreshold?: number;
};

export async function writeReport(
  outDir: string,
  recipe: Recipe,
  findings: Finding[],
  gaps: CoverageGap[] = [],
  opts: WriteReportOptions = {},
): Promise<{ mdPath: string; ndjsonPath: string; metaPath: string; summary: ReportSummary }> {
  await mkdir(outDir, { recursive: true });

  const summary = aggregate(findings, {
    ...(opts.scoreThreshold !== undefined ? { scoreThreshold: opts.scoreThreshold } : {}),
    ...(opts.warnThreshold !== undefined ? { warnThreshold: opts.warnThreshold } : {}),
  });

  const generatedAt = new Date().toISOString();
  const baseRunMeta: RunMeta = {
    recipeName: recipe.name,
    scanners: listScannersInRecipe(recipe).map((name) => ({ name })),
    startedAt: generatedAt,
    endedAt: generatedAt,
    durationMs: 0,
  };
  const runMeta: RunMeta = baseRunMeta;
  if (opts.runMeta) {
    for (const [k, v] of Object.entries(opts.runMeta)) {
      if (v !== undefined) (runMeta as Record<string, unknown>)[k] = v;
    }
  }

  const ctx: ReportContext = {
    recipe,
    findings,
    runMeta,
    gaps,
    generatedAt,
    summary,
  };

  const templateName = opts.template ?? recipe.report.template ?? 'executive';
  const md = await renderReport(templateName, ctx);

  const mdPath = path.join(outDir, 'report.md');
  const ndjsonPath = path.join(outDir, 'findings.ndjson');
  const metaPath = path.join(outDir, 'meta.json');

  await writeFile(mdPath, md, 'utf8');
  await writeFile(
    ndjsonPath,
    findings.map((f) => JSON.stringify(f)).join('\n') + (findings.length ? '\n' : ''),
    'utf8',
  );
  await writeFile(
    metaPath,
    JSON.stringify({ recipe, runMeta, summary, gaps, generatedAt }, null, 2),
    'utf8',
  );

  return { mdPath, ndjsonPath, metaPath, summary };
}
