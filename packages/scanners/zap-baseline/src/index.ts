import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exec, hasDocker, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type ZapAlert = {
  alert?: string;
  name?: string;
  riskcode?: string | number;
  riskdesc?: string;
  desc?: string;
  cweid?: string;
  wascid?: string;
  instances?: Array<{ uri?: string; method?: string; param?: string; evidence?: string }>;
};

type ZapSite = { alerts?: ZapAlert[]; '@name'?: string };
type ZapReport = { site?: ZapSite[] };

export const zapBaselineScanner: Scanner = {
  name: 'zap-baseline',
  category: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!hasDocker()) {
      throw new Error('Docker requis pour zap-baseline. Installer Docker.');
    }
    const work = mkdtempSync(path.join(tmpdir(), 'basile-zap-'));
    try {
      const cmd = [
        'docker',
        'run',
        '--rm',
        '-v',
        `${work}:/zap/wrk:rw`,
        'ghcr.io/zaproxy/zaproxy:stable',
        'zap-baseline.py',
        '-t',
        target.url,
        '-J',
        'report.json',
        '-I',
      ];
      await exec(cmd, { okExitCodes: [0, 1, 2], timeoutMs: 30 * 60_000 });
      const reportPath = path.join(work, 'report.json');
      const json = readFileSync(reportPath, 'utf8');
      return parseZapJson(json, target.id);
    } finally {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* ignore cleanup */
      }
    }
  },
};

function mapSeverity(rc: string | number | undefined): Severity {
  const n = typeof rc === 'string' ? parseInt(rc, 10) : (rc ?? 0);
  if (n >= 3) return 'high';
  if (n === 2) return 'medium';
  if (n === 1) return 'low';
  return 'info';
}

export function parseZapJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie ZAP invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as ZapReport;
  const findings: Finding[] = [];
  for (const site of report.site ?? []) {
    for (const alert of site.alerts ?? []) {
      const f: Finding = {
        scanner: 'zap-baseline',
        category: 'security',
        severity: mapSeverity(alert.riskcode),
        target: targetId,
        message: alert.name ?? alert.alert ?? alert.desc ?? 'ZAP alert',
        raw: alert,
      };
      if (alert.alert) f.rule = alert.alert;
      if (alert.cweid && alert.cweid !== '-1') f.cwe = `CWE-${alert.cweid}`;
      const inst = alert.instances?.[0];
      if (inst?.uri) f.file = inst.uri;
      findings.push(f);
    }
  }
  return findings;
}
