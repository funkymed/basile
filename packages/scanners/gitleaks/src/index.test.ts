import { describe, it, expect } from 'vitest';
import { gitleaksScanner, parseGitleaksJson } from './index.js';

describe('gitleaksScanner', () => {
  it('declares its identity', () => {
    expect(gitleaksScanner.name).toBe('gitleaks');
    expect(gitleaksScanner.category).toBe('secrets');
  });

  it('parses gitleaks JSON array', () => {
    const json = JSON.stringify([
      {
        Description: 'AWS key',
        RuleID: 'aws-access-key',
        File: 'config.env',
        StartLine: 3,
        EndLine: 3,
        Secret: 'AKIA...',
      },
    ]);
    const findings = parseGitleaksJson(json, 't1');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'critical',
      category: 'secrets',
      file: 'config.env',
      line: 3,
      rule: 'aws-access-key',
    });
  });
});
