import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEslintJson, eslintScanner } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/eslint.json'), 'utf8');

describe('eslintScanner', () => {
  it('declares quality category and eslint name', () => {
    expect(eslintScanner.name).toBe('eslint');
    expect(eslintScanner.category).toBe('quality');
  });

  it('supports() filters on code + ts/react/nodejs stacks', () => {
    expect(
      eslintScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['eslint'],
      }),
    ).toBe(true);
    expect(
      eslintScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['php'],
        scanners: ['eslint'],
      }),
    ).toBe(false);
    expect(
      eslintScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['eslint'] }),
    ).toBe(false);
  });

  it('parses ESLint JSON into Findings with severity mapping', () => {
    const findings = parseEslintJson(fixture, 't1', '/proj');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      scanner: 'eslint',
      category: 'quality',
      severity: 'high',
      target: 't1',
      file: 'src/a.ts',
      line: 4,
      rule: 'no-unused-vars',
    });
    expect(findings[1]?.severity).toBe('low');
  });
});
