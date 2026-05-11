import type { Category, Finding, Severity } from '@basile/core';
import type { Recipe } from '@basile/core';
import type { AttackSurfaceSection } from './attack-surface.js';

export type RunMeta = {
  recipeName: string;
  scanners: Array<{ name: string; version?: string }>;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  basileVersion?: string;
};

export type CoverageGap = {
  scanner: string;
  reason: string;
  target?: string;
};

export type ReportContext = {
  recipe: Recipe;
  findings: Finding[];
  runMeta: RunMeta;
  gaps?: CoverageGap[];
  generatedAt: string;
  summary: ReportSummary;
  /** Number of findings hidden by report filters (smart_filter, min_severity, exclude_rules). */
  filteredOut?: number;
  /** Human-readable reason explaining the filter behavior. */
  filterReason?: string;
  /** Structured Attack Surface section, present only when `attack-surface` scanner emitted a summary. */
  attackSurface?: AttackSurfaceSection;
};

export type ReportSummary = {
  totalFindings: number;
  byCategory: Record<Category, number>;
  bySeverity: Record<Severity, number>;
  byTarget: Record<string, number>;
  byScanner: Record<string, number>;
  topRules: Array<{ rule: string; count: number; severity: Severity }>;
  score: number;
  scoreThreshold: number;
  verdict: 'pass' | 'warn' | 'fail';
};
