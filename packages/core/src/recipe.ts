import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { Stack, TargetType } from './types.js';

export const ReportFormat = z.enum(['md', 'pdf', 'html', 'docx', 'json']);
export type ReportFormat = z.infer<typeof ReportFormat>;

export const ReportTemplate = z.enum(['executive', 'technical', 'security']);
export type ReportTemplate = z.infer<typeof ReportTemplate>;

const CodeTarget = z.object({
  id: z.string().min(1),
  type: z.literal('code'),
  path: z.string().min(1),
  stacks: z.array(Stack).min(1),
  scanners: z.array(z.string()).min(1),
  exclude_paths: z.array(z.string()).optional(),
});
export type CodeTarget = z.infer<typeof CodeTarget>;

const UrlTarget = z.object({
  id: z.string().min(1),
  type: z.literal('url'),
  url: z.string().url(),
  scanners: z.array(z.string()).min(1),
  auth: z
    .object({
      bearer: z.string().optional(),
      basic: z.object({ user: z.string(), pass: z.string() }).optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});
export type UrlTarget = z.infer<typeof UrlTarget>;

export const RecipeTarget = z.discriminatedUnion('type', [CodeTarget, UrlTarget]);
export type RecipeTarget = z.infer<typeof RecipeTarget>;

export const ReportConfig = z.object({
  formats: z.array(ReportFormat).min(1).default(['md']),
  template: ReportTemplate.default('executive'),
  group_by: z.array(z.enum(['target', 'severity', 'category', 'scanner'])).default(['target', 'severity']),
  exclude_rules: z.array(z.string()).optional(),
  min_severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
});
export type ReportConfig = z.infer<typeof ReportConfig>;

export const Recipe = z.object({
  name: z.string().min(1),
  output: z.string().default('./reports/{{date}}'),
  parallel: z.number().int().positive().max(32).default(4),
  targets: z.array(RecipeTarget).min(1),
  report: ReportConfig.default({} as never),
});
export type Recipe = z.infer<typeof Recipe>;

export class RecipeValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'RecipeValidationError';
  }
}

export async function loadRecipe(filePath: string): Promise<Recipe> {
  const abs = path.resolve(filePath);
  const raw = await readFile(abs, 'utf8');
  const parsed = parseYaml(raw);
  const result = Recipe.safeParse(parsed);
  if (!result.success) {
    throw new RecipeValidationError(
      `Recipe invalide: ${filePath}\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}

export function loadRecipeFromString(yaml: string): Recipe {
  const parsed = parseYaml(yaml);
  const result = Recipe.safeParse(parsed);
  if (!result.success) {
    throw new RecipeValidationError(
      `Recipe invalide:\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('\n');
}

export function resolveOutputDir(recipe: Recipe, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const slug = recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return recipe.output.replace('{{date}}', date).replace('{{name}}', slug);
}

export function listScannersInRecipe(recipe: Recipe): string[] {
  const set = new Set<string>();
  for (const t of recipe.targets) {
    for (const s of t.scanners) set.add(s);
  }
  return [...set].sort();
}
