import { describe, expect, it } from 'vitest';
import type { Finding } from '@basile/core';
import { aggregate } from './aggregate.js';

const f = (overrides: Partial<Finding>): Finding => ({
  scanner: 'eslint',
  category: 'quality',
  severity: 'low',
  target: 't1',
  message: 'msg',
  ...overrides,
});

describe('aggregate', () => {
  it('counts by severity, category, target and scanner', () => {
    const findings: Finding[] = [
      f({ severity: 'critical', category: 'security', target: 'app', scanner: 'semgrep', rule: 'r1' }),
      f({ severity: 'high', category: 'security', target: 'app', scanner: 'semgrep', rule: 'r1' }),
      f({ severity: 'low', category: 'quality', target: 'web', scanner: 'eslint', rule: 'r2' }),
    ];
    const s = aggregate(findings);
    expect(s.totalFindings).toBe(3);
    expect(s.bySeverity.critical).toBe(1);
    expect(s.bySeverity.high).toBe(1);
    expect(s.bySeverity.low).toBe(1);
    expect(s.byCategory.security).toBe(2);
    expect(s.byCategory.quality).toBe(1);
    expect(s.byTarget['app']).toBe(2);
    expect(s.byTarget['web']).toBe(1);
    expect(s.byScanner['semgrep']).toBe(2);
  });

  it('computes weighted score (10+5+1=16)', () => {
    const findings: Finding[] = [
      f({ severity: 'critical' }),
      f({ severity: 'high' }),
      f({ severity: 'low' }),
    ];
    const s = aggregate(findings);
    expect(s.score).toBe(16);
  });

  it('verdict thresholds', () => {
    expect(aggregate([], { scoreThreshold: 50, warnThreshold: 20 }).verdict).toBe('pass');
    expect(
      aggregate([f({ severity: 'high' }), f({ severity: 'high' }), f({ severity: 'high' }), f({ severity: 'high' }), f({ severity: 'high' })], {
        scoreThreshold: 50,
        warnThreshold: 20,
      }).verdict,
    ).toBe('warn');
    expect(
      aggregate(Array.from({ length: 6 }, () => f({ severity: 'critical' })), {
        scoreThreshold: 50,
        warnThreshold: 20,
      }).verdict,
    ).toBe('fail');
  });

  it('top rules sorted by count desc and limited to 10', () => {
    const findings: Finding[] = [
      ...Array.from({ length: 3 }, () => f({ rule: 'r-a', severity: 'low' })),
      ...Array.from({ length: 5 }, () => f({ rule: 'r-b', severity: 'high' })),
      f({ rule: 'r-c' }),
    ];
    const s = aggregate(findings);
    expect(s.topRules[0]?.rule).toBe('r-b');
    expect(s.topRules[0]?.count).toBe(5);
    expect(s.topRules.length).toBeLessThanOrEqual(10);
  });
});
