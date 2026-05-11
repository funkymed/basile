import {
  categorizeHost,
  exec,
  extractRootDomain,
  type Finding,
  type HostCategory,
  type RecipeTarget,
  type Severity,
  which,
} from '@basile/core';
import type { Scanner } from '@basile/runner';
import { parseSubfinderOutput } from '@basile/scanner-subfinder';
import { matchSignatures } from '@basile/scanner-wafw00f-lite';

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_CONCURRENCY = 10;

type HostReport = {
  host: string;
  url: string;
  category: HostCategory;
  status: number;
  grade: string;
  headersMissing: string[];
  waf: string | null;
};

type Metrics = {
  duration_ms: number;
  subdomains_total: number;
  subdomains_alive: number;
  grade_global: string;
  waf_coverage_pct: number;
  exposed_dev_count: number;
  exposed_internal_count: number;
};

export const attackSurfaceScanner: Scanner = {
  name: 'attack-surface',
  category: 'security',
  profile: 'security',
  supports: (t: RecipeTarget): boolean => t.type === 'domain' || t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'domain' && target.type !== 'url') return [];
    if (!which('subfinder')) {
      throw new Error('Binary "subfinder" not found. Run `basile setup --scanners subfinder`.');
    }
    if (!which('curl')) {
      throw new Error('Binary "curl" not found.');
    }

    const startedAt = Date.now();
    const input = target.type === 'domain' ? target.domain : target.url;
    const { root } = extractRootDomain(input);

    // 1. Enumerate
    const subRes = await exec(
      ['subfinder', '-d', root, '-silent', '-timeout', '10', '-max-time', '1'],
      { okExitCodes: [0], timeoutMs: 60_000 },
    );
    const candidates = parseSubfinderOutput(subRes.stdout, root);
    // Always include the root domain itself for completeness.
    if (!candidates.includes(root)) candidates.unshift(root);

    // 2. Probe alive + per-host audit (parallel, capped)
    const reports = await runParallel(candidates, PROBE_CONCURRENCY, (host) =>
      probeHost(host, root),
    );
    const alive = reports.filter((r): r is HostReport => r !== null);

    const metrics = computeMetrics(alive, candidates.length, Date.now() - startedAt);

    return buildFindings(target.id, root, alive, metrics);
  },
};

export async function probeHost(host: string, root: string): Promise<HostReport | null> {
  // Try HTTPS first, fallback HTTP. Skip if neither is reachable.
  for (const scheme of ['https', 'http'] as const) {
    const url = `${scheme}://${host}`;
    const headRes = await exec(
      [
        'curl',
        '--silent',
        '--insecure',
        '--max-time',
        String(Math.ceil(PROBE_TIMEOUT_MS / 1000)),
        '--connect-timeout',
        '3',
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_code}|%{header_json}',
        '-I',
        url,
      ],
      { timeoutMs: PROBE_TIMEOUT_MS + 2_000, okExitCodes: [0, 22, 28, 56] },
    );

    const [codeStr] = headRes.stdout.split('|', 1);
    const status = Number.parseInt(codeStr ?? '0', 10);
    if (!status || status === 0) continue;

    // Full HEAD response for header grading + WAF detection
    const fullHead = await exec(
      [
        'curl',
        '--silent',
        '--insecure',
        '--max-time',
        '5',
        '--connect-timeout',
        '3',
        '--user-agent',
        'basile-recon/1.0',
        '-I',
        '-L',
        url,
      ],
      { timeoutMs: PROBE_TIMEOUT_MS + 2_000, okExitCodes: [0, 22, 28, 56] },
    );
    const headerText = fullHead.stdout;
    const grading = gradeHeaders(headerText);
    const wafMatches = matchSignatures(headerText);

    return {
      host,
      url,
      category: categorizeHost(host, root),
      status,
      grade: grading.grade,
      headersMissing: grading.missing,
      waf: wafMatches.length > 0 ? wafMatches.map((m) => m.name).join(', ') : null,
    };
  }
  return null;
}

/**
 * Score response headers against 8 OWASP-recommended security headers.
 * Returns a grade A+/F and the list of missing headers.
 */
export function gradeHeaders(raw: string): { grade: string; missing: string[]; score: number; max: number } {
  const required = [
    'strict-transport-security',
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
  ];

  const lower = raw.toLowerCase();
  const missing: string[] = [];
  let score = 0;
  for (const header of required) {
    if (new RegExp(`^${header}:`, 'm').test(lower)) {
      score += 1;
    } else {
      missing.push(header);
    }
  }

  const max = required.length;
  let grade: string;
  if (score === max) grade = 'A+';
  else if (score === max - 1) grade = 'A';
  else if (score === max - 2) grade = 'B';
  else if (score === max - 3) grade = 'C';
  else if (score === max - 4) grade = 'D';
  else grade = 'F';

  return { grade, missing, score, max };
}

export function computeMetrics(alive: HostReport[], total: number, durationMs: number): Metrics {
  const gradeRank = ['A+', 'A', 'B', 'C', 'D', 'F'];
  const gradeIndex = (g: string): number => gradeRank.indexOf(g);
  const totalScore = alive.reduce((acc, r) => acc + (5 - Math.min(5, gradeIndex(r.grade))), 0);
  const maxScore = alive.length * 5;
  const pct = maxScore === 0 ? 0 : totalScore / maxScore;

  let gradeGlobal: string;
  if (pct >= 0.95) gradeGlobal = 'A+';
  else if (pct >= 0.85) gradeGlobal = 'A';
  else if (pct >= 0.7) gradeGlobal = 'B';
  else if (pct >= 0.55) gradeGlobal = 'C';
  else if (pct >= 0.4) gradeGlobal = 'D';
  else gradeGlobal = 'F';

  const wafCount = alive.filter((r) => r.waf !== null).length;

  return {
    duration_ms: durationMs,
    subdomains_total: total,
    subdomains_alive: alive.length,
    grade_global: gradeGlobal,
    waf_coverage_pct: alive.length === 0 ? 0 : Math.round((wafCount / alive.length) * 100),
    exposed_dev_count: alive.filter((r) => r.category === 'dev_staging').length,
    exposed_internal_count: alive.filter((r) => r.category === 'internal').length,
  };
}

function buildFindings(
  targetId: string,
  root: string,
  alive: HostReport[],
  metrics: Metrics,
): Finding[] {
  const findings: Finding[] = [];

  // Summary finding
  findings.push({
    scanner: 'attack-surface',
    category: 'security',
    severity: 'info',
    target: targetId,
    rule: 'attack_surface.summary',
    message: `${metrics.subdomains_alive}/${metrics.subdomains_total} hosts alive · grade ${metrics.grade_global} · ${metrics.waf_coverage_pct}% WAF coverage`,
    raw: {
      root_domain: root,
      metrics,
      inventory: alive.map((h) => ({
        host: h.host,
        url: h.url,
        category: h.category,
        status: h.status,
        grade: h.grade,
        waf: h.waf,
        headers_missing: h.headersMissing,
      })),
    },
  });

  // Per-host risk findings
  for (const host of alive) {
    if (host.category === 'dev_staging') {
      findings.push({
        scanner: 'attack-surface',
        category: 'security',
        severity: 'high',
        target: targetId,
        rule: 'attack_surface.exposed_dev_environment',
        message: `Non-production environment exposed: ${host.url}`,
        raw: { host: host.host, status: host.status, category: host.category },
      });
    }
    if (host.category === 'internal') {
      findings.push({
        scanner: 'attack-surface',
        category: 'security',
        severity: 'high',
        target: targetId,
        rule: 'attack_surface.exposed_internal_service',
        message: `Internal-named host publicly reachable: ${host.url}`,
        raw: { host: host.host, status: host.status, category: host.category },
      });
    }
    if (host.headersMissing.length > 0) {
      // Aggregate into a single medium finding per host (avoid finding spam).
      findings.push({
        scanner: 'attack-surface',
        category: 'security',
        severity: severityForGrade(host.grade),
        target: targetId,
        rule: 'attack_surface.missing_security_headers',
        message: `${host.url} grade ${host.grade} — missing: ${host.headersMissing.join(', ')}`,
        raw: { host: host.host, grade: host.grade, missing: host.headersMissing },
      });
    }
    if (host.waf === null && ['api', 'app', 'admin'].includes(host.category)) {
      findings.push({
        scanner: 'attack-surface',
        category: 'security',
        severity: 'low',
        target: targetId,
        rule: 'attack_surface.no_waf_protection',
        message: `Public-facing host without WAF: ${host.url}`,
        raw: { host: host.host, category: host.category },
      });
    }
  }

  return findings;
}

function severityForGrade(grade: string): Severity {
  if (grade === 'F' || grade === 'D') return 'high';
  if (grade === 'C' || grade === 'B') return 'medium';
  return 'low';
}

/**
 * Run async tasks with a concurrency cap. Returns results in input order.
 */
async function runParallel<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      if (item === undefined) return;
      results[i] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}
