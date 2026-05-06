import { describe, it, expect } from 'vitest';
import { bearerScanner, parseBearerJson } from './index.js';

describe('bearerScanner', () => {
  it('declares its identity', () => {
    expect(bearerScanner.name).toBe('bearer');
    expect(bearerScanner.category).toBe('privacy');
  });

  it('parses bearer JSON across severities', () => {
    const json = JSON.stringify({
      high: [
        {
          id: 'php_lang_logger_pii',
          title: 'PII in logs',
          cwe_ids: ['CWE-532'],
          owasp_top10: ['A09:2021'],
          filename: 'src/Logger.php',
          line_number: 12,
        },
      ],
      low: [{ id: 'lo', title: 'Low', filename: 'a.ts', line_number: 1 }],
    });
    const findings = parseBearerJson(json, 't1');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      severity: 'high',
      cwe: 'CWE-532',
      owasp: 'A09:2021',
      file: 'src/Logger.php',
      line: 12,
    });
  });
});
