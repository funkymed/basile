import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDepcheckJson, depcheckScanner } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/depcheck.json'), 'utf8');

describe('depcheckScanner', () => {
  it('declares deps category and depcheck name', () => {
    expect(depcheckScanner.name).toBe('depcheck');
    expect(depcheckScanner.category).toBe('deps');
  });

  it('supports() filters on code + ts/react/nodejs stacks', () => {
    expect(
      depcheckScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['nodejs'],
        scanners: ['depcheck'],
      }),
    ).toBe(true);
  });

  it('parses depcheck JSON output into Findings', () => {
    const findings = parseDepcheckJson(fixture, 't1');
    expect(findings).toHaveLength(3);
    expect(findings.find((f) => f.message.includes('unused-prod'))?.severity).toBe('medium');
    expect(findings.find((f) => f.message.includes('unused-dev'))?.severity).toBe('low');
    expect(findings.find((f) => f.message.includes('missing-pkg'))?.severity).toBe('high');
  });
});
