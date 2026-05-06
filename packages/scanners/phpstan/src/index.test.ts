import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phpstanScanner, parsePhpstanJson } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/phpstan.json'), 'utf8');

describe('phpstanScanner', () => {
  it('declares its identity', () => {
    expect(phpstanScanner.name).toBe('phpstan');
    expect(phpstanScanner.category).toBe('quality');
  });

  it('supports() matches php/symfony code targets', () => {
    expect(
      phpstanScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['php'],
        scanners: ['phpstan'],
      }),
    ).toBe(true);
    expect(
      phpstanScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['symfony'],
        scanners: ['phpstan'],
      }),
    ).toBe(true);
    expect(
      phpstanScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['phpstan'],
      }),
    ).toBe(false);
    expect(
      phpstanScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['phpstan'] }),
    ).toBe(false);
  });

  it('parses PHPStan JSON output and strips /app/ prefix', () => {
    const findings = parsePhpstanJson(fixture, 't1', '/local/proj');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      scanner: 'phpstan',
      category: 'quality',
      severity: 'high',
      target: 't1',
      file: 'src/Service/Foo.php',
      line: 12,
      rule: 'missingType.return',
    });
    expect(findings[1]?.rule).toBe('phpstan');
  });
});
