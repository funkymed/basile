import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNpmAuditJson, npmAuditScanner } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/npm-audit.json'), 'utf8');

describe('npmAuditScanner', () => {
  it('declares deps category and npm-audit name', () => {
    expect(npmAuditScanner.name).toBe('npm-audit');
    expect(npmAuditScanner.category).toBe('deps');
  });

  it('supports() filters on code + ts/react/nodejs stacks', () => {
    expect(
      npmAuditScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['nodejs'],
        scanners: ['npm-audit'],
      }),
    ).toBe(true);
  });

  it('parses npm audit JSON output into Findings', () => {
    const findings = parseNpmAuditJson(fixture, 't1');
    expect(findings).toHaveLength(2);
    const lodash = findings.find((f) => f.message.includes('Prototype Pollution'));
    expect(lodash).toMatchObject({
      severity: 'high',
      category: 'deps',
      file: 'package.json',
      cwe: 'CWE-1321',
      rule: '1094499',
    });
    const minimist = findings.find((f) => f.message.includes('minimist'));
    expect(minimist?.severity).toBe('medium');
  });
});
