import type { Category, Finding, Severity } from '@basile/core';
import { SEVERITY_ORDER, SEVERITY_WEIGHTS } from '@basile/core';
import type { ReportSummary } from './types.js';

const CATEGORIES: Category[] = ['security', 'quality', 'performance', 'a11y', 'deps', 'secrets', 'privacy'];

function emptySeverityMap(): Record<Severity, number> {
  const out = {} as Record<Severity, number>;
  for (const s of SEVERITY_ORDER) out[s] = 0;
  return out;
}

function emptyCategoryMap(): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) out[c] = 0;
  return out;
}

export type AggregateOptions = {
  /** Score threshold above which the verdict is fail. Default: 50. */
  scoreThreshold?: number;
  /** Score warn threshold (verdict warn if score >= warnThreshold and < scoreThreshold). Default: 20. */
  warnThreshold?: number;
};

export function aggregate(findings: Finding[], opts: AggregateOptions = {}): ReportSummary {
  const scoreThreshold = opts.scoreThreshold ?? 50;
  const warnThreshold = opts.warnThreshold ?? 20;

  const bySeverity = emptySeverityMap();
  const byCategory = emptyCategoryMap();
  const byTarget: Record<string, number> = {};
  const byScanner: Record<string, number> = {};
  const ruleCounts = new Map<string, { count: number; severity: Severity }>();

  let score = 0;

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    byTarget[f.target] = (byTarget[f.target] ?? 0) + 1;
    byScanner[f.scanner] = (byScanner[f.scanner] ?? 0) + 1;
    score += SEVERITY_WEIGHTS[f.severity];
    if (f.rule) {
      const existing = ruleCounts.get(f.rule);
      if (existing) {
        existing.count += 1;
        // Keep highest severity for that rule
        if (SEVERITY_WEIGHTS[f.severity] > SEVERITY_WEIGHTS[existing.severity]) {
          existing.severity = f.severity;
        }
      } else {
        ruleCounts.set(f.rule, { count: 1, severity: f.severity });
      }
    }
  }

  const topRules = [...ruleCounts.entries()]
    .map(([rule, v]) => ({ rule, count: v.count, severity: v.severity }))
    .sort((a, b) => b.count - a.count || SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity])
    .slice(0, 10);

  const verdict: 'pass' | 'warn' | 'fail' =
    score >= scoreThreshold ? 'fail' : score >= warnThreshold ? 'warn' : 'pass';

  return {
    totalFindings: findings.length,
    byCategory,
    bySeverity,
    byTarget,
    byScanner,
    topRules,
    score,
    scoreThreshold,
    verdict,
  };
}
