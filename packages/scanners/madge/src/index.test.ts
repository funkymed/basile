import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMadgeJson, madgeScanner } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/madge.json'), 'utf8');

describe('madgeScanner', () => {
  it('declares quality category and madge name', () => {
    expect(madgeScanner.name).toBe('madge');
    expect(madgeScanner.category).toBe('quality');
  });

  it('supports() filters on code + ts/react/nodejs stacks', () => {
    expect(
      madgeScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['madge'],
      }),
    ).toBe(true);
  });

  it('parses madge JSON cycles output into Findings', () => {
    const findings = parseMadgeJson(fixture, 't1');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      scanner: 'madge',
      category: 'quality',
      severity: 'medium',
      file: 'src/a.ts',
      rule: 'madge-cycle',
    });
    expect(findings[0]?.message).toContain('src/a.ts → src/b.ts → src/c.ts → src/a.ts');
  });
});
