import { exec, ExecError, which, type Finding, type RecipeTarget } from '@basile/core';
import type { Scanner } from '@basile/runner';

const SUPPORTED_STACKS = new Set(['typescript', 'react', 'nodejs']);

type KnipExportItem = {
  file?: string;
  line?: number;
  symbol?: string;
  name?: string;
};

type KnipReport = {
  files?: string[];
  dependencies?:
    | Array<{ name: string }>
    | { unused?: Array<{ name: string } | string>; unlisted?: Array<{ name: string } | string> };
  devDependencies?: Array<{ name: string } | string>;
  unlisted?: Array<{ name: string } | string>;
  exports?: Array<KnipExportItem> | { unused?: KnipExportItem[] };
};

export const knipScanner: Scanner = {
  name: 'knip',
  category: 'quality',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('knip')) {
      throw new Error('Binaire "knip" introuvable. Installer Knip globalement (npm i -g knip).');
    }
    const cmd = ['knip', '--reporter', 'json'];
    let stdout: string;
    try {
      const r = await exec(cmd, { okExitCodes: [0, 1], cwd: target.path, timeoutMs: 10 * 60_000 });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parseKnipJson(stdout, target.id);
  },
};

function depName(item: { name: string } | string): string {
  return typeof item === 'string' ? item : item.name;
}

/** Parses knip JSON output into Finding objects. */
export function parseKnipJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Knip invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as KnipReport;
  if (!report || typeof report !== 'object') return [];
  const findings: Finding[] = [];

  // Unused files
  for (const file of report.files ?? []) {
    findings.push({
      scanner: 'knip',
      category: 'quality',
      severity: 'low',
      target: targetId,
      file,
      rule: 'knip-files',
      message: 'Fichier inutilisé',
    });
  }

  // Dependencies (unused / unlisted) — handle both flat and nested shapes.
  let unusedDeps: Array<{ name: string } | string> = [];
  let unlistedDeps: Array<{ name: string } | string> = [];
  if (Array.isArray(report.dependencies)) {
    unusedDeps = report.dependencies;
  } else if (report.dependencies && typeof report.dependencies === 'object') {
    unusedDeps = report.dependencies.unused ?? [];
    unlistedDeps = report.dependencies.unlisted ?? [];
  }
  if (Array.isArray(report.devDependencies)) {
    unusedDeps = unusedDeps.concat(report.devDependencies);
  }
  if (Array.isArray(report.unlisted)) {
    unlistedDeps = unlistedDeps.concat(report.unlisted);
  }

  for (const dep of unusedDeps) {
    const name = depName(dep);
    findings.push({
      scanner: 'knip',
      category: 'deps',
      severity: 'medium',
      target: targetId,
      file: 'package.json',
      rule: 'knip-dependencies-unused',
      message: `Dépendance inutilisée: ${name}`,
    });
  }
  for (const dep of unlistedDeps) {
    const name = depName(dep);
    findings.push({
      scanner: 'knip',
      category: 'deps',
      severity: 'high',
      target: targetId,
      file: 'package.json',
      rule: 'knip-dependencies-unlisted',
      message: `Dépendance non listée: ${name}`,
    });
  }

  // Exports
  let exportItems: KnipExportItem[] = [];
  if (Array.isArray(report.exports)) {
    exportItems = report.exports;
  } else if (report.exports && typeof report.exports === 'object') {
    exportItems = report.exports.unused ?? [];
  }
  for (const item of exportItems) {
    const symbol = item.symbol ?? item.name ?? 'unknown';
    findings.push({
      scanner: 'knip',
      category: 'quality',
      severity: 'low',
      target: targetId,
      ...(item.file ? { file: item.file } : {}),
      ...(item.line !== undefined ? { line: item.line } : {}),
      rule: 'knip-exports-unused',
      message: `Export inutilisé: ${symbol}`,
    });
  }

  return findings;
}
