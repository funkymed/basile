import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKnipJson, knipScanner } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/knip.json'), 'utf8');

describe('knipScanner', () => {
  it('declares quality category and knip name', () => {
    expect(knipScanner.name).toBe('knip');
    expect(knipScanner.category).toBe('quality');
  });

  it('supports() filters on code + ts/react/nodejs stacks', () => {
    expect(
      knipScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['react'],
        scanners: ['knip'],
      }),
    ).toBe(true);
  });

  it('parses knip JSON output into Findings', () => {
    const findings = parseKnipJson(fixture, 't1');
    // 1 file + 2 deps unused + 1 unlisted + 1 export
    expect(findings).toHaveLength(5);
    expect(findings.some((f) => f.message === 'Unused file' && f.file === 'src/dead.ts')).toBe(true);
    expect(findings.some((f) => f.message === 'Unused dependency: lodash')).toBe(true);
    expect(findings.some((f) => f.message === 'Unused dependency: old-tool')).toBe(true);
    expect(findings.some((f) => f.message === 'Unlisted dependency: missing-pkg' && f.severity === 'high')).toBe(true);
    expect(findings.some((f) => f.message === 'Unused export: unusedFn' && f.line === 12)).toBe(true);
  });
});
