import { describe, it, expect } from 'vitest';
import { zapBaselineScanner, parseZapJson } from './index.js';

describe('zapBaselineScanner', () => {
  it('declares its identity', () => {
    expect(zapBaselineScanner.name).toBe('zap-baseline');
    expect(zapBaselineScanner.category).toBe('security');
  });

  it('parses ZAP JSON site/alerts', () => {
    const json = JSON.stringify({
      site: [
        {
          '@name': 'https://x',
          alerts: [
            {
              alert: 'Missing Anti-CSRF',
              name: 'Anti-CSRF token missing',
              riskcode: '2',
              cweid: '352',
              instances: [{ uri: 'https://x/form' }],
            },
          ],
        },
      ],
    });
    const findings = parseZapJson(json, 't1');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'medium',
      cwe: 'CWE-352',
      file: 'https://x/form',
    });
  });
});
