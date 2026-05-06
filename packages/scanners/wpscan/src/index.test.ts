import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wpscanScanner, parseWpscanJson } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/wpscan.json'), 'utf8');

describe('wpscanScanner', () => {
  it('declares its identity', () => {
    expect(wpscanScanner.name).toBe('wpscan');
    expect(wpscanScanner.category).toBe('security');
  });

  it('supports() matches url targets only', () => {
    expect(
      wpscanScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['wpscan'] }),
    ).toBe(true);
    expect(
      wpscanScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['wordpress'],
        scanners: ['wpscan'],
      }),
    ).toBe(false);
  });

  it('parses wpscan JSON output', () => {
    const findings = parseWpscanJson(fixture, 't1');
    expect(findings).toHaveLength(2);
    const core = findings.find((f) => f.message.includes('WordPress core'));
    expect(core).toMatchObject({
      scanner: 'wpscan',
      category: 'security',
      severity: 'high',
      target: 't1',
      rule: 'CVE-2022-21661',
      cwe: 'CWE-89',
    });
    const plugin = findings.find((f) => f.message.includes('Plugin contact-form-7'));
    expect(plugin?.severity).toBe('medium');
    expect(plugin?.message).toContain('aucun correctif');
  });
});
