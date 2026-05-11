import path from 'node:path';
import { existsSync } from 'node:fs';
import { exec, ExecError, which, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

const SUPPORTED_STACKS = new Set(['typescript', 'react', 'nodejs']);

type NpmVia =
  | string
  | {
      source?: number | string;
      name?: string;
      dependency?: string;
      title?: string;
      url?: string;
      severity?: string;
      range?: string;
      cwe?: string[] | string;
    };

type NpmVuln = {
  name: string;
  severity: string;
  via: NpmVia[];
  fixAvailable?: unknown;
};

type NpmAuditReport = {
  vulnerabilities?: Record<string, NpmVuln>;
};

function mapSeverity(s: string): Severity {
  switch (s) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

export const npmAuditScanner: Scanner = {
  name: 'npm-audit',
  category: 'deps',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    if (!which('npm')) {
      throw new Error('Binary "npm" not found. Install Node.js/npm.');
    }
    if (!existsSync(path.join(target.path, 'package-lock.json'))) {
      // npm audit nécessite un lockfile; sortie silencieuse.
      return [];
    }
    const cmd = ['npm', 'audit', '--json'];
    let stdout: string;
    try {
      const r = await exec(cmd, { okExitCodes: [0, 1], cwd: target.path, timeoutMs: 10 * 60_000 });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        return [];
      }
    }
    return parseNpmAuditJson(stdout, target.id);
  },
};

/** Parses npm audit v2 JSON output into Finding objects. */
export function parseNpmAuditJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie npm audit invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as NpmAuditReport;
  if (!report || typeof report !== 'object' || !report.vulnerabilities) return [];
  const findings: Finding[] = [];

  for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
    const severity = mapSeverity(vuln.severity);
    // Find first object via for richer info.
    const objectVia = (vuln.via ?? []).find((v): v is Exclude<NpmVia, string> => typeof v === 'object');
    const title = objectVia?.title;
    const ruleSource = objectVia?.source !== undefined ? String(objectVia.source) : undefined;
    const cwe = objectVia?.cwe;
    const cweStr = Array.isArray(cwe) ? cwe[0] : cwe;
    findings.push({
      scanner: 'npm-audit',
      category: 'deps',
      severity,
      target: targetId,
      file: 'package.json',
      ...(ruleSource ? { rule: ruleSource } : {}),
      ...(cweStr ? { cwe: cweStr } : {}),
      message: title ?? `Vulnerability in ${name}`,
      raw: vuln,
    });
  }
  return findings;
}
