import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import type { Finding, Recipe, Severity } from '@basile/core';
import { SEVERITY_ORDER, listScannersInRecipe } from '@basile/core';
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
  // Strategy: try sibling templates/ inside the package first (works when packed),
  // then walk upwards (works in monorepo dev).
  const inPackage = path.resolve(here, '..', 'templates');
  if (await exists(inPackage)) return inPackage;
  let dir = here;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'templates');
    if (await exists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Templates directory not found (looked at ${inPackage} and walked up from ${here})`);
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
  /** When true, bypass smart_filter and show all severities (full report). */
  full?: boolean;
};

export async function writeReport(
  outDir: string,
  recipe: Recipe,
  findings: Finding[],
  gaps: CoverageGap[] = [],
  opts: WriteReportOptions = {},
): Promise<{ mdPath: string; ndjsonPath: string; metaPath: string; summary: ReportSummary; filteredOut: number }> {
  await mkdir(outDir, { recursive: true });

  // Apply report filters BEFORE aggregation so summary reflects the visible set.
  // 1. min_severity hard floor (explicit, always wins)
  // 2. smart_filter: if any critical/high exists, hide medium/low/info; else keep all
  // 3. exclude_rules: drop findings matching rule glob list
  const { visible, hidden } = applyReportFilters(findings, recipe, opts.full ?? false);

  const summary = aggregate(visible, {
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
    findings: visible,
    runMeta,
    gaps,
    generatedAt,
    summary,
  };
  // Surface filter info to templates (count + reason).
  (ctx as ReportContext & { filteredOut?: number; filterReason?: string }).filteredOut = hidden.length;
  if (hidden.length > 0) {
    (ctx as ReportContext & { filterReason?: string }).filterReason = describeFilter(recipe, findings);
  }

  const templateName = opts.template ?? recipe.report.template ?? 'executive';
  const md = await renderReport(templateName, ctx);

  const mdPath = path.join(outDir, 'report.md');
  const ndjsonPath = path.join(outDir, 'findings.ndjson');
  const metaPath = path.join(outDir, 'meta.json');

  await writeFile(mdPath, md, 'utf8');
  // findings.ndjson keeps ALL findings (raw, unfiltered) for downstream re-processing.
  await writeFile(
    ndjsonPath,
    findings.map((f) => JSON.stringify(f)).join('\n') + (findings.length ? '\n' : ''),
    'utf8',
  );
  await writeFile(
    metaPath,
    JSON.stringify({ recipe, runMeta, summary, gaps, generatedAt, filteredOut: hidden.length }, null, 2),
    'utf8',
  );

  return { mdPath, ndjsonPath, metaPath, summary, filteredOut: hidden.length };
}

/**
 * Apply report-level filters in priority order.
 *
 * Default behavior: hide medium/low/info (only critical + high in report).
 * Override paths:
 *  - `full=true` (CLI --full flag) → show every severity
 *  - `recipe.report.min_severity` set → use as hard floor (e.g. "low" = show critical+high+medium+low)
 *  - `recipe.report.smart_filter: false` → show every severity
 *
 * Returns visible findings + the ones that were dropped (for transparency).
 */
export function applyReportFilters(
  findings: Finding[],
  recipe: Recipe,
  full = false,
): { visible: Finding[]; hidden: Finding[] } {
  let pool = findings;

  // 1a. exclude_rules (legacy: drop by rule name globally)
  const excludeRules = recipe.report.exclude_rules;
  if (excludeRules && excludeRules.length > 0) {
    const set = new Set(excludeRules);
    pool = pool.filter((f) => !f.rule || !set.has(f.rule));
  }

  // 1b. exclude_findings (granular: drop by combination of rule/scanner/target/path)
  const excludeFindings = recipe.report.exclude_findings;
  if (excludeFindings && excludeFindings.length > 0) {
    pool = pool.filter((f) => {
      for (const ex of excludeFindings) {
        if (ex.rule && f.rule !== ex.rule) continue;
        if (ex.scanner && f.scanner !== ex.scanner) continue;
        if (ex.target && f.target !== ex.target) continue;
        if (ex.path && (!f.file || !f.file.includes(ex.path))) continue;
        return false; // every specified field matched → drop
      }
      return true;
    });
  }

  // 2. Severity filter
  if (full || recipe.report.smart_filter === false) {
    // Show all severities.
  } else if (recipe.report.min_severity) {
    const minIdx = SEVERITY_ORDER.indexOf(recipe.report.min_severity);
    pool = pool.filter((f) => SEVERITY_ORDER.indexOf(f.severity) <= minIdx);
  } else {
    // Default: only critical + high.
    pool = pool.filter((f) => f.severity === 'critical' || f.severity === 'high');
  }

  const visibleSet = new Set(pool);
  const hidden = findings.filter((f) => !visibleSet.has(f));
  return { visible: pool, hidden };
}

function describeFilter(recipe: Recipe, _all: Finding[]): string {
  if (recipe.report.min_severity) return `min_severity=${recipe.report.min_severity}`;
  if (recipe.report.smart_filter === false) return 'smart_filter désactivé (rapport complet)';
  return 'défaut: medium/low/info masqués (utiliser --full pour rapport complet)';
}
