import type { Category, Finding, RecipeTarget } from '@basile/core';

/** A scanner unit: declares which target shapes it can handle and runs against them. */
export interface Scanner {
  readonly name: string;
  readonly category: Category;
  readonly supports: (target: RecipeTarget) => boolean;
  run(target: RecipeTarget, opts: ScanOptions): Promise<Finding[]>;
}

export type ScanOptions = {
  /** Output dir resolved by the runner; scanners may write artifacts under outDir/raw. */
  outDir: string;
  /** Optional cancellation signal forwarded by the runner. */
  signal?: AbortSignal;
};

export type ScanMode = 'local' | 'docker';

export type ScanResult = {
  target: string;
  scanner: string;
  findings: Finding[];
  durationMs: number;
  mode: ScanMode;
  error?: string;
};
