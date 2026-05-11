import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  execHybrid,
  ExecError,
  type Finding,
  type RecipeTarget,
  type Severity,
} from '@basile/core';
import type { Scanner } from '@basile/runner';

type ComposerAdvisory = {
  advisoryId?: string;
  packageName?: string;
  title?: string;
  link?: string;
  cve?: string | null;
  severity?: string;
  affectedVersions?: string;
  reportedAt?: string;
  sources?: Array<{ name?: string; remoteId?: string }>;
};

type ComposerAuditReport = {
  advisories?: Record<string, ComposerAdvisory[] | ComposerAdvisory>;
  abandoned?: Record<string, string | null>;
};

const SUPPORTED_STACKS = new Set(['php', 'symfony']);

export const composerAuditScanner: Scanner = {
  name: 'composer-audit',
  category: 'deps',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => {
    if (t.type !== 'code') return false;
    return t.stacks.some((s) => SUPPORTED_STACKS.has(s));
  },

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'code') return [];
    // composer audit needs a composer.lock to operate.
    if (!existsSync(path.join(target.path, 'composer.lock'))) return [];

    const commonArgs = ['audit', '--format=json', '--no-interaction'];

    let stdout: string;
    try {
      const r = await execHybrid({
        localBin: 'composer',
        localArgs: commonArgs,
        docker: {
          image: 'composer:2',
          args: commonArgs,
          volumes: [{ host: target.path, container: '/app' }],
          workdir: '/app',
        },
        // composer audit returns 1 when vulnerabilities are found.
        exec: { okExitCodes: [0, 1], timeoutMs: 2 * 60_000, cwd: target.path },
      });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parseComposerAuditJson(stdout, target.id);
  },
};

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  moderate: 'medium',
  low: 'low',
  info: 'info',
};

function mapSeverity(s: string | undefined): Severity {
  if (!s) return 'medium';
  return SEVERITY_MAP[s.toLowerCase()] ?? 'medium';
}

function extractCwe(advisory: ComposerAdvisory): string | undefined {
  const haystacks = [advisory.link, advisory.title, ...(advisory.sources?.map((x) => x.remoteId ?? '') ?? [])];
  for (const h of haystacks) {
    if (!h) continue;
    const m = h.match(/CWE[-_]?(\d+)/i);
    if (m) return `CWE-${m[1]}`;
  }
  return undefined;
}

/** Parses `composer audit --format=json` output into Finding objects. */
export function parseComposerAuditJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie composer audit invalide (JSON parse): ${(e as Error).message}`);
  }
  const report = parsed as ComposerAuditReport;
  if (!report || typeof report !== 'object' || !report.advisories) return [];

  const findings: Finding[] = [];

  for (const [pkg, entries] of Object.entries(report.advisories)) {
    const list: ComposerAdvisory[] = Array.isArray(entries) ? entries : [entries];
    for (const adv of list) {
      const severity = mapSeverity(adv.severity);
      const cwe = extractCwe(adv);
      const ruleId = adv.advisoryId ?? adv.cve ?? 'composer-audit';
      const pkgName = adv.packageName ?? pkg;
      const affected = adv.affectedVersions ? ` (versions affectées: ${adv.affectedVersions})` : '';
      const cveTag = adv.cve ? ` [${adv.cve}]` : '';
      findings.push({
        scanner: 'composer-audit',
        category: 'deps',
        severity,
        target: targetId,
        file: 'composer.lock',
        rule: ruleId,
        ...(cwe ? { cwe } : {}),
        message: `${pkgName}: ${adv.title ?? 'Vulnérabilité connue'}${cveTag}${affected}`,
        raw: adv,
      });
    }
  }
  return findings;
}
