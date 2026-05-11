import { describe, it, expect } from 'vitest';
import { computeMetrics, gradeHeaders } from './index.js';

describe('gradeHeaders', () => {
  it('grades A+ when all 8 headers present', () => {
    const raw = [
      'HTTP/2 200',
      'Strict-Transport-Security: max-age=63072000',
      'Content-Security-Policy: default-src self',
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: camera=()',
      'Cross-Origin-Opener-Policy: same-origin',
      'Cross-Origin-Resource-Policy: same-site',
    ].join('\n');
    const r = gradeHeaders(raw);
    expect(r.grade).toBe('A+');
    expect(r.score).toBe(8);
    expect(r.missing).toEqual([]);
  });

  it('grades A with 7/8 headers', () => {
    const raw = [
      'HTTP/2 200',
      'Strict-Transport-Security: max-age=63072000',
      'Content-Security-Policy: default-src self',
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: camera=()',
      'Cross-Origin-Opener-Policy: same-origin',
    ].join('\n');
    expect(gradeHeaders(raw).grade).toBe('A');
  });

  it('grades F when no headers present', () => {
    const raw = 'HTTP/2 200\nServer: nginx\n';
    const r = gradeHeaders(raw);
    expect(r.grade).toBe('F');
    expect(r.score).toBe(0);
    expect(r.missing.length).toBe(8);
  });

  it('is case insensitive on header names', () => {
    const raw = 'HTTP/2 200\nstrict-transport-security: max-age=1\nx-frame-options: DENY\n';
    expect(gradeHeaders(raw).score).toBe(2);
  });
});

describe('computeMetrics', () => {
  it('aggregates correctly with mixed grades', () => {
    const hosts = [
      { host: 'a.example.com', url: 'https://a.example.com', category: 'app' as const, status: 200, grade: 'A+', headersMissing: [], waf: 'Cloudflare' },
      { host: 'b.example.com', url: 'https://b.example.com', category: 'api' as const, status: 200, grade: 'A', headersMissing: ['permissions-policy'], waf: 'Cloudflare' },
      { host: 'staging.example.com', url: 'https://staging.example.com', category: 'dev_staging' as const, status: 200, grade: 'F', headersMissing: ['a','b','c','d','e','f','g','h'], waf: null },
      { host: 'internal.example.com', url: 'https://internal.example.com', category: 'internal' as const, status: 401, grade: 'C', headersMissing: ['x','y'], waf: null },
    ];
    const m = computeMetrics(hosts, 6, 47000);
    expect(m.subdomains_total).toBe(6);
    expect(m.subdomains_alive).toBe(4);
    expect(m.exposed_dev_count).toBe(1);
    expect(m.exposed_internal_count).toBe(1);
    expect(m.waf_coverage_pct).toBe(50);
    expect(['A', 'B', 'C']).toContain(m.grade_global);
    expect(m.duration_ms).toBe(47000);
  });

  it('handles zero alive hosts safely', () => {
    const m = computeMetrics([], 5, 10000);
    expect(m.subdomains_alive).toBe(0);
    expect(m.waf_coverage_pct).toBe(0);
    expect(m.grade_global).toBe('F');
  });
});
