import { exec, which, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

export const headersScanner: Scanner = {
  name: 'headers',
  category: 'security',
  profile: 'security',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!which('curl')) {
      throw new Error('Binaire "curl" introuvable.');
    }
    const r = await exec(
      ['curl', '-sI', '-o', '/dev/null', '-D', '-', '--max-time', '30', target.url],
      { okExitCodes: [0], timeoutMs: 30_000 },
    );
    return analyzeHeaders(r.stdout, target.id);
  },
};

type HeaderRule = {
  rule: string;
  severity: Severity;
  message: string;
};

const MISSING_RULES: Array<{ name: string; alt?: string[]; rule: HeaderRule }> = [
  {
    name: 'strict-transport-security',
    rule: { rule: 'hsts-missing', severity: 'high', message: 'Header Strict-Transport-Security missing' },
  },
  {
    name: 'content-security-policy',
    rule: { rule: 'csp-missing', severity: 'high', message: 'Header Content-Security-Policy missing' },
  },
  {
    name: 'x-content-type-options',
    rule: { rule: 'xcto-missing', severity: 'medium', message: 'Header X-Content-Type-Options missing or not nosniff' },
  },
  {
    name: 'x-frame-options',
    alt: ['content-security-policy'],
    rule: { rule: 'xfo-missing', severity: 'medium', message: 'Header X-Frame-Options or CSP frame-ancestors missing' },
  },
  {
    name: 'referrer-policy',
    rule: { rule: 'referrer-policy-missing', severity: 'low', message: 'Header Referrer-Policy missing' },
  },
  {
    name: 'permissions-policy',
    rule: { rule: 'permissions-policy-missing', severity: 'low', message: 'Header Permissions-Policy missing' },
  },
];

export function parseHeaders(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!name || /^http\//i.test(name)) continue;
    // Last value wins (handles redirect chains).
    out.set(name, value);
  }
  return out;
}

export function analyzeHeaders(raw: string, targetId: string): Finding[] {
  const headers = parseHeaders(raw);
  const findings: Finding[] = [];

  for (const r of MISSING_RULES) {
    if (r.name === 'x-content-type-options') {
      const v = headers.get(r.name);
      if (!v || !/nosniff/i.test(v)) {
        findings.push(toFinding(targetId, r.rule));
      }
      continue;
    }
    if (r.name === 'x-frame-options') {
      const xfo = headers.get('x-frame-options');
      const csp = headers.get('content-security-policy');
      const cspHasFA = csp && /frame-ancestors/i.test(csp);
      if (!xfo && !cspHasFA) {
        findings.push(toFinding(targetId, r.rule));
      }
      continue;
    }
    if (!headers.has(r.name)) {
      findings.push(toFinding(targetId, r.rule));
    }
  }

  const server = headers.get('server');
  if (server && /\/[\d.]+/.test(server)) {
    findings.push(
      toFinding(targetId, {
        rule: 'server-version-leak',
        severity: 'low',
        message: `Server header exposes version: ${server}`,
      }),
    );
  }
  if (headers.has('x-powered-by')) {
    findings.push(
      toFinding(targetId, {
        rule: 'x-powered-by-leak',
        severity: 'low',
        message: `X-Powered-By header exposed: ${headers.get('x-powered-by')}`,
      }),
    );
  }

  return findings;
}

function toFinding(targetId: string, r: HeaderRule): Finding {
  return {
    scanner: 'headers',
    category: 'security',
    severity: r.severity,
    target: targetId,
    rule: r.rule,
    message: r.message,
  };
}
