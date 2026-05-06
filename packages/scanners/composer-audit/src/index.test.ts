import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composerAuditScanner, parseComposerAuditJson } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/composer-audit.json'), 'utf8');

describe('composerAuditScanner', () => {
  it('declares its identity', () => {
    expect(composerAuditScanner.name).toBe('composer-audit');
    expect(composerAuditScanner.category).toBe('deps');
  });

  it('supports() matches php/symfony only', () => {
    expect(
      composerAuditScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['php'],
        scanners: ['composer-audit'],
      }),
    ).toBe(true);
    expect(
      composerAuditScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['wordpress'],
        scanners: ['composer-audit'],
      }),
    ).toBe(false);
  });

  it('parses composer audit JSON output', () => {
    const findings = parseComposerAuditJson(fixture, 't1');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      scanner: 'composer-audit',
      category: 'deps',
      severity: 'high',
      target: 't1',
      file: 'composer.lock',
      rule: 'PKSA-1234-5678',
      cwe: 'CWE-444',
    });
    expect(findings[0]?.message).toContain('symfony/http-kernel');
    expect(findings[0]?.message).toContain('CVE-2023-46734');
    expect(findings[1]?.severity).toBe('low');
  });

  it('returns [] on empty advisories', () => {
    expect(parseComposerAuditJson('{"advisories":{}}', 't1')).toEqual([]);
    expect(parseComposerAuditJson('', 't1')).toEqual([]);
  });
});
