import { describe, it, expect } from 'vitest';
import { nucleiScanner, parseNucleiNdjson } from './index.js';

describe('nucleiScanner', () => {
  it('declares its identity', () => {
    expect(nucleiScanner.name).toBe('nuclei');
    expect(nucleiScanner.category).toBe('security');
  });

  it('parses NDJSON output', () => {
    const ndjson = [
      JSON.stringify({
        'template-id': 'tech-detect',
        info: { name: 'Tech', severity: 'info', description: 'detected' },
        host: 'https://x',
        'matched-at': 'https://x/',
      }),
      JSON.stringify({
        'template-id': 'cve-2024-1',
        info: {
          name: 'RCE',
          severity: 'critical',
          description: 'remote',
          classification: { 'cwe-id': 'cwe-94' },
        },
        'matched-at': 'https://x/path',
      }),
    ].join('\n');
    const findings = parseNucleiNdjson(ndjson, 't1');
    expect(findings).toHaveLength(2);
    expect(findings[1]).toMatchObject({
      severity: 'critical',
      cwe: 'CWE-94',
      rule: 'cve-2024-1',
      file: 'https://x/path',
    });
  });
});
