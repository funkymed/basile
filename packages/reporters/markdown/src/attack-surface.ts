import type { Finding } from '@basile/core';

export type AttackSurfaceInventoryHost = {
  host: string;
  url?: string;
  category: string;
  status: number | null;
  grade: string;
  waf: string | null;
  headers_missing?: string[];
};

export type AttackSurfaceMetrics = {
  duration_ms?: number;
  subdomains_total: number;
  subdomains_alive: number;
  grade_global: string;
  waf_coverage_pct: number;
  exposed_dev_count: number;
  exposed_internal_count: number;
};

export type AttackSurfaceRisk = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  rule?: string;
};

export type AttackSurfaceSection = {
  rootDomain: string;
  metrics: AttackSurfaceMetrics;
  inventory: AttackSurfaceInventoryHost[];
  risks: AttackSurfaceRisk[];
};

/**
 * Extract attack-surface section from findings (if any).
 *
 * Returns:
 *   - `section`: structured payload for the template (or undefined if no summary finding).
 *   - `findings`: original list MINUS the summary finding (which is rendered as a dedicated section).
 *
 * Per-host risk findings are kept in the regular list so they continue to render in their
 * target's findings block. They are also mirrored under `section.risks` for the dedicated
 * "Risks identified" sub-list inside the attack-surface section.
 */
export function extractAttackSurface(findings: Finding[]): {
  section: AttackSurfaceSection | undefined;
  findings: Finding[];
} {
  const summary = findings.find(
    (f) => f.scanner === 'attack-surface' && f.rule === 'attack_surface.summary',
  );
  if (!summary) {
    return { section: undefined, findings };
  }

  const raw = (summary.raw ?? {}) as {
    root_domain?: string;
    metrics?: Partial<AttackSurfaceMetrics>;
    inventory?: AttackSurfaceInventoryHost[];
  };

  const metrics: AttackSurfaceMetrics = {
    subdomains_total: raw.metrics?.subdomains_total ?? 0,
    subdomains_alive: raw.metrics?.subdomains_alive ?? 0,
    grade_global: raw.metrics?.grade_global ?? '—',
    waf_coverage_pct: raw.metrics?.waf_coverage_pct ?? 0,
    exposed_dev_count: raw.metrics?.exposed_dev_count ?? 0,
    exposed_internal_count: raw.metrics?.exposed_internal_count ?? 0,
    ...(raw.metrics?.duration_ms !== undefined ? { duration_ms: raw.metrics.duration_ms } : {}),
  };

  const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];

  // Aggregate per-host risk findings into a compact "risks" list for the section.
  const risks: AttackSurfaceRisk[] = [];
  const missingHeaderHosts = new Set<string>();
  for (const f of findings) {
    if (f.scanner !== 'attack-surface') continue;
    if (f.rule === 'attack_surface.summary') continue;
    if (f.rule === 'attack_surface.missing_security_headers') {
      const host = (f.raw as { host?: string } | undefined)?.host;
      if (host) missingHeaderHosts.add(host);
      continue;
    }
    risks.push({
      severity: f.severity as AttackSurfaceRisk['severity'],
      message: f.message,
      ...(f.rule ? { rule: f.rule } : {}),
    });
  }
  if (missingHeaderHosts.size > 0) {
    risks.push({
      severity: 'medium',
      message: `${missingHeaderHosts.size} host(s) missing security headers`,
      rule: 'attack_surface.missing_security_headers',
    });
  }

  const section: AttackSurfaceSection = {
    rootDomain: raw.root_domain ?? summary.target,
    metrics,
    inventory,
    risks,
  };

  // Remove the summary finding from the regular findings list (avoid duplicate rendering).
  const filtered = findings.filter((f) => f !== summary);

  return { section, findings: filtered };
}

/**
 * Grade → color hint usable by templates (consumed via `gradeClass` helper).
 * green: A+/A · yellow: B/C · red: D/F
 */
export function gradeBucket(grade: string | undefined | null): 'good' | 'warn' | 'bad' | 'unknown' {
  if (!grade) return 'unknown';
  const g = grade.toUpperCase();
  if (g === 'A+' || g === 'A') return 'good';
  if (g === 'B' || g === 'C') return 'warn';
  if (g === 'D' || g === 'E' || g === 'F') return 'bad';
  return 'unknown';
}
