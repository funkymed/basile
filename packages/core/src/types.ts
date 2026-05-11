import { z } from 'zod';

export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof Severity>;

export const Category = z.enum([
  'security',
  'quality',
  'performance',
  'a11y',
  'deps',
  'secrets',
  'privacy',
]);
export type Category = z.infer<typeof Category>;

export const Stack = z.enum([
  'php',
  'symfony',
  'wordpress',
  'typescript',
  'react',
  'nodejs',
  'url',
]);
export type Stack = z.infer<typeof Stack>;

export const TargetType = z.enum(['code', 'url', 'domain']);
export type TargetType = z.infer<typeof TargetType>;

export const Finding = z.object({
  scanner: z.string(),
  category: Category,
  severity: Severity,
  target: z.string(),
  file: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  rule: z.string().optional(),
  cwe: z.string().optional(),
  owasp: z.string().optional(),
  message: z.string(),
  raw: z.unknown().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
  info: 0,
};

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Default exclusion patterns applied by all code scanners. Covers package
 * directories, build artifacts, and tool caches. Recipe `exclude_paths` is
 * merged with this list (additive).
 *
 * Each scanner translates these to its own ignore syntax (--exclude,
 * --skip-dirs, --ignore-pattern, etc.).
 */
export const DEFAULT_EXCLUDES: string[] = [
  // package managers
  'node_modules',
  'vendor',
  'bower_components',
  // build outputs
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.parcel-cache',
  // Symfony / Laravel
  'var/cache',
  'var/log',
  'var/sessions',
  'bootstrap/cache',
  'storage/framework',
  'storage/logs',
  'public/build',
  'public/bundles',
  // tests / coverage
  'coverage',
  '.nyc_output',
  '.phpunit.result.cache',
  // tool caches
  '.cache',
  '.eslintcache',
  '.stylelintcache',
  '.php-cs-fixer.cache',
  '.php_cs.cache',
  '.phpstan.neon.cache',
  '.psalm.cache',
  // version control
  '.git',
  '.svn',
  '.hg',
  // IDE
  '.idea',
  '.vscode',
  // misc
  'tmp',
  'temp',
  '.DS_Store',
];

/** File patterns (globs) for caches/locks too granular for directory excludes. */
export const DEFAULT_EXCLUDE_GLOBS: string[] = [
  '*.cache',
  '*.log',
  '*.tsbuildinfo',
  '*.lock.cache',
];

/**
 * Merge default excludes with a recipe target's `exclude_paths`.
 * Returns deduplicated, normalized list (no leading/trailing slashes).
 */
export function mergeExcludes(targetExcludes: readonly string[] = []): string[] {
  const all = [...DEFAULT_EXCLUDES, ...targetExcludes];
  const normalized = all.map((p) => p.replace(/^\/+|\/+$/g, ''));
  return [...new Set(normalized)];
}
