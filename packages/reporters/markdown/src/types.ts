import type { Category, Finding, Severity } from '@basile/core';
import type { Recipe } from '@basile/core';

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
