import { Category, type Finding, type Severity } from '@basile/core';

const SEVERITY_ALIASES: Record<string, Severity> = {
  critical: 'critical',
  crit: 'critical',
  blocker: 'critical',
  fatal: 'critical',
  high: 'high',
  error: 'high',
  err: 'high',
  major: 'high',
  '2': 'high',
  medium: 'medium',
  warning: 'medium',
  warn: 'medium',
  moderate: 'medium',
  '1': 'medium',
  low: 'low',
  minor: 'low',
  notice: 'low',
  info: 'info',
  information: 'info',
  hint: 'info',
  '0': 'info',
};

/** Maps an arbitrary scanner severity string/number to a canonical Severity. */
export function mapSeverity(raw: string | number | undefined | null, fallback: Severity = 'medium'): Severity {
  if (raw === undefined || raw === null) return fallback;
  const key = String(raw).trim().toLowerCase();
  return SEVERITY_ALIASES[key] ?? fallback;
}

/** Coerces a raw category string to a canonical Category, using fallback if unknown. */
export function coerceCategory(raw: string | undefined | null, fallback: Category = 'quality'): Category {
  if (!raw) return fallback;
  const parsed = Category.safeParse(raw.toLowerCase());
  return parsed.success ? parsed.data : fallback;
}

/** Builds a Finding from a partial, applying defaults from the scanner/target context. */
export function withDefaults(
  partial: Partial<Finding>,
  scanner: string,
  target: string,
): Finding {
  return {
    scanner: partial.scanner ?? scanner,
    category: partial.category ?? 'quality',
    severity: partial.severity ?? 'medium',
    target: partial.target ?? target,
    ...(partial.file !== undefined ? { file: partial.file } : {}),
    ...(partial.line !== undefined ? { line: partial.line } : {}),
    ...(partial.rule !== undefined ? { rule: partial.rule } : {}),
    ...(partial.cwe !== undefined ? { cwe: partial.cwe } : {}),
    ...(partial.owasp !== undefined ? { owasp: partial.owasp } : {}),
    message: partial.message ?? '',
    ...(partial.raw !== undefined ? { raw: partial.raw } : {}),
  };
}
