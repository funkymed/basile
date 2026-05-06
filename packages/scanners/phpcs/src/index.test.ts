import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phpcsScanner, parsePhpcsJson } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/phpcs.json'), 'utf8');

describe('phpcsScanner', () => {
  it('declares its identity', () => {
    expect(phpcsScanner.name).toBe('phpcs');
    expect(phpcsScanner.category).toBe('quality');
  });

  it('supports() matches php/symfony/wordpress code targets', () => {
    for (const stack of ['php', 'symfony', 'wordpress'] as const) {
      expect(
        phpcsScanner.supports({
          id: 't',
          type: 'code',
          path: '/p',
          stacks: [stack],
          scanners: ['phpcs'],
        }),
      ).toBe(true);
    }
    expect(
      phpcsScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['phpcs'],
      }),
    ).toBe(false);
    expect(
      phpcsScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['phpcs'] }),
    ).toBe(false);
  });

  it('parses PHPCS JSON output', () => {
    const findings = parsePhpcsJson(fixture, 't1', '/local/proj');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      scanner: 'phpcs',
      category: 'quality',
      severity: 'high',
      target: 't1',
      file: 'src/Foo.php',
      line: 1,
      rule: 'PSR1.Files.SideEffects',
    });
    expect(findings[1]?.severity).toBe('medium');
  });
});
