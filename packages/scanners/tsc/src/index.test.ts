import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTscOutput, tscScanner } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/tsc.txt'), 'utf8');

describe('tscScanner', () => {
  it('declares quality category and tsc name', () => {
    expect(tscScanner.name).toBe('tsc');
    expect(tscScanner.category).toBe('quality');
  });

  it('supports() filters on code + ts/react/nodejs stacks', () => {
    expect(
      tscScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['tsc'],
      }),
    ).toBe(true);
    expect(
      tscScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['php'],
        scanners: ['tsc'],
      }),
    ).toBe(false);
  });

  it('parses tsc text output into Findings', () => {
    const findings = parseTscOutput(fixture, 't1', '/proj');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      scanner: 'tsc',
      category: 'quality',
      severity: 'high',
      target: 't1',
      file: 'src/a.ts',
      line: 10,
      rule: 'TS2345',
    });
    expect(findings[1]?.severity).toBe('medium');
    expect(findings[1]?.rule).toBe('TS6133');
  });
});
