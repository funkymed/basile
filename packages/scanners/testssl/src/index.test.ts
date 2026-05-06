import { describe, it, expect } from 'vitest';
import { testsslScanner, parseTestSslJson } from './index.js';

describe('testsslScanner', () => {
  it('declares its identity', () => {
    expect(testsslScanner.name).toBe('testssl');
    expect(testsslScanner.category).toBe('security');
  });

  it('parses entries and skips OK', () => {
    const json = JSON.stringify([
      { id: 'cipher_x', severity: 'CRITICAL', finding: 'Weak cipher', cwe: 'CWE-327' },
      { id: 'tls_ok', severity: 'OK', finding: 'TLS fine' },
      { id: 'info_x', severity: 'INFO', finding: 'Info' },
    ]);
    const findings = parseTestSslJson(json, 't1');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ severity: 'critical', cwe: 'CWE-327' });
    expect(findings[1]?.severity).toBe('info');
  });
});
