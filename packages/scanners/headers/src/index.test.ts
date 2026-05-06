import { describe, it, expect } from 'vitest';
import { headersScanner, analyzeHeaders } from './index.js';

describe('headersScanner', () => {
  it('declares its identity', () => {
    expect(headersScanner.name).toBe('headers');
    expect(headersScanner.category).toBe('security');
  });

  it('flags missing security headers', () => {
    const raw = ['HTTP/2 200', 'Content-Type: text/html', 'Server: nginx/1.20.1', 'X-Powered-By: PHP/8.2'].join('\r\n');
    const findings = analyzeHeaders(raw, 't1');
    const rules = new Set(findings.map((f) => f.rule));
    expect(rules.has('hsts-missing')).toBe(true);
    expect(rules.has('csp-missing')).toBe(true);
    expect(rules.has('xcto-missing')).toBe(true);
    expect(rules.has('xfo-missing')).toBe(true);
    expect(rules.has('referrer-policy-missing')).toBe(true);
    expect(rules.has('permissions-policy-missing')).toBe(true);
    expect(rules.has('server-version-leak')).toBe(true);
    expect(rules.has('x-powered-by-leak')).toBe(true);
  });

  it('passes when headers present', () => {
    const raw = [
      'HTTP/2 200',
      'Strict-Transport-Security: max-age=31536000',
      'Content-Security-Policy: default-src \'self\'; frame-ancestors \'none\'',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: geolocation=()',
    ].join('\r\n');
    const findings = analyzeHeaders(raw, 't1');
    expect(findings).toHaveLength(0);
  });
});
