import { describe, it, expect } from 'vitest';
import { trivyScanner, parseTrivyJson } from './index.js';

describe('trivyScanner', () => {
  it('declares its identity', () => {
    expect(trivyScanner.name).toBe('trivy');
    expect(trivyScanner.category).toBe('security');
  });

  it('parses vuln + secret + misconfig', () => {
    const json = JSON.stringify({
      Results: [
        {
          Target: 'package-lock.json',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2024-1234',
              PkgName: 'lodash',
              InstalledVersion: '4.17.20',
              Severity: 'HIGH',
              Title: 'Prototype pollution',
              CweIDs: ['CWE-1321'],
            },
          ],
          Secrets: [
            { RuleID: 'aws-key', Severity: 'CRITICAL', Title: 'AWS', StartLine: 5 },
          ],
          Misconfigurations: [
            { ID: 'AVD-DS-0001', Severity: 'MEDIUM', Title: 'Dockerfile bad practice' },
          ],
        },
      ],
    });
    const findings = parseTrivyJson(json, 't1');
    expect(findings).toHaveLength(3);
    expect(findings.find((f) => f.category === 'deps')).toMatchObject({
      severity: 'high',
      cwe: 'CWE-1321',
    });
    expect(findings.find((f) => f.category === 'secrets')).toMatchObject({ severity: 'critical' });
  });
});
