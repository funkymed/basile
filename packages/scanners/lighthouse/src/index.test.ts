import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lighthouseScanner, parseLighthouseLhr } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(__dirname, '__fixtures__/lhr.json'), 'utf8');

describe('lighthouseScanner', () => {
  it('declares its identity', () => {
    expect(lighthouseScanner.name).toBe('lighthouse');
    expect(lighthouseScanner.category).toBe('performance');
  });

  it('supports() only matches URL targets', () => {
    expect(lighthouseScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['lighthouse'] })).toBe(true);
    expect(
      lighthouseScanner.supports({
        id: 't',
        type: 'code',
        path: '/p',
        stacks: ['typescript'],
        scanners: ['lighthouse'],
      }),
    ).toBe(false);
  });

  it('parses LHR audits below 0.9 and classifies categories', () => {
    const findings = parseLighthouseLhr(fixture, 't1');
    const byRule = new Map(findings.map((f) => [f.rule, f]));
    // is-on-https score=1 must be skipped.
    expect(byRule.has('is-on-https')).toBe(false);
    expect(byRule.get('first-contentful-paint')).toMatchObject({
      category: 'performance',
      severity: 'high',
    });
    expect(byRule.get('color-contrast')).toMatchObject({
      category: 'a11y',
      severity: 'medium',
    });
    expect(byRule.get('image-aspect-ratio')).toMatchObject({
      category: 'quality',
      severity: 'medium',
    });
  });
});
