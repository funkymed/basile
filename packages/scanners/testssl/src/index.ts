import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exec, ExecError, which, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type TestSslEntry = {
  id?: string;
  ip?: string;
  port?: string;
  severity?: string;
  finding?: string;
  cve?: string;
  cwe?: string;
  exploit?: string;
};

export const testsslScanner: Scanner = {
  name: 'testssl',
  category: 'security',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!which('testssl.sh')) {
      throw new Error('Binary "testssl.sh" not found.');
    }
    const work = mkdtempSync(path.join(tmpdir(), 'basile-testssl-'));
    const reportPath = path.join(work, 'report.json');
    try {
      const cmd = [
        'testssl.sh',
        `--jsonfile-pretty=${reportPath}`,
        '--quiet',
        '--color',
        '0',
        target.url,
      ];
      try {
        await exec(cmd, { okExitCodes: [0, 1], timeoutMs: 10 * 60_000 });
      } catch (err) {
        // testssl exit codes are unreliable; continue if report file exists.
        if (!(err instanceof ExecError)) throw err;
      }
      const json = readFileSync(reportPath, 'utf8');
      return parseTestSslJson(json, target.id);
    } finally {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  },
};

function mapSeverity(s: string | undefined): Severity | null {
  switch ((s ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    case 'INFO':
      return 'info';
    case 'OK':
      return null;
    default:
      return null;
  }
}

export function parseTestSslJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie testssl invalide (JSON parse): ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) return [];
  const entries = parsed as TestSslEntry[];
  const findings: Finding[] = [];
  for (const e of entries) {
    const sev = mapSeverity(e.severity);
    if (sev === null) continue;
    const f: Finding = {
      scanner: 'testssl',
      category: 'security',
      severity: sev,
      target: targetId,
      message: e.finding ?? e.id ?? 'testssl finding',
      raw: e,
    };
    if (e.id) f.rule = e.id;
    if (e.cwe) f.cwe = e.cwe;
    findings.push(f);
  }
  return findings;
}
