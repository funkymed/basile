import { execHybrid, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type NucleiClassification = { 'cwe-id'?: string | string[]; 'cve-id'?: string | string[] };

type NucleiInfo = {
  name?: string;
  severity?: string;
  description?: string;
  tags?: string[];
  classification?: NucleiClassification;
};

type NucleiHit = {
  'template-id'?: string;
  info?: NucleiInfo;
  host?: string;
  'matched-at'?: string;
  type?: string;
};

export const nucleiScanner: Scanner = {
  name: 'nuclei',
  category: 'security',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    const args = ['-u', target.url, '-jsonl', '-silent', '-no-color'];
    const r = await execHybrid({
      localBin: 'nuclei',
      localArgs: args,
      docker: {
        image: 'projectdiscovery/nuclei:latest',
        args,
      },
      exec: { okExitCodes: [0], timeoutMs: 15 * 60_000 },
    });
    return parseNucleiNdjson(r.stdout, target.id);
  },
};

function mapSeverity(s: string | undefined): Severity {
  switch ((s ?? '').toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

function firstStr(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function parseNucleiNdjson(stdout: string, targetId: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const hit = parsed as NucleiHit;
    const info = hit.info ?? {};
    const f: Finding = {
      scanner: 'nuclei',
      category: 'security',
      severity: mapSeverity(info.severity),
      target: targetId,
      message: `${info.name ?? hit['template-id'] ?? 'nuclei finding'} — ${info.description ?? ''}`.trim(),
      raw: hit,
    };
    if (hit['template-id']) f.rule = hit['template-id'];
    if (hit['matched-at']) f.file = hit['matched-at'];
    const cwe = firstStr(info.classification?.['cwe-id']);
    if (cwe) f.cwe = cwe.toUpperCase().startsWith('CWE-') ? cwe.toUpperCase() : `CWE-${cwe}`;
    findings.push(f);
  }
  return findings;
}
