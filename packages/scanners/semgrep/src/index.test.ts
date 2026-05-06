import { describe, it, expect } from 'vitest';
import { semgrepScanner, parseSemgrepJson } from './index.js';

describe('semgrepScanner', () => {
  it('declares its identity', () => {
    expect(semgrepScanner.name).toBe('semgrep');
    expect(semgrepScanner.category).toBe('security');
  });

  it('supports() matches code targets with supported stacks', () => {
    expect(
      semgrepScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['semgrep'],
      }),
    ).toBe(true);
    expect(
      semgrepScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['semgrep'] }),
    ).toBe(false);
  });

  it('parses semgrep JSON results', () => {
    const json = JSON.stringify({
      results: [
        {
          check_id: 'js.lang.security.audit.xss',
          path: '/src/app.js',
          start: { line: 10, col: 1 },
          end: { line: 10, col: 30 },
          extra: {
            message: 'Possible XSS',
            severity: 'ERROR',
            metadata: { cwe: ['CWE-79'], owasp: 'A03:2021' },
          },
        },
      ],
    });
    const findings = parseSemgrepJson(json, 't1', '/src');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      scanner: 'semgrep',
      severity: 'high',
      file: 'app.js',
      line: 10,
      cwe: 'CWE-79',
      owasp: 'A03:2021',
    });
  });
});
