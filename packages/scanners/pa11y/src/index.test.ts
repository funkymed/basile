import { describe, it, expect } from 'vitest';
import { pa11yScanner, parsePa11yJson } from './index.js';

describe('pa11yScanner', () => {
  it('declares its identity', () => {
    expect(pa11yScanner.name).toBe('pa11y');
    expect(pa11yScanner.category).toBe('a11y');
  });

  it('only supports URL targets', () => {
    expect(
      pa11yScanner.supports({ id: 't', type: 'url', url: 'https://x', scanners: ['pa11y'] }),
    ).toBe(true);
  });

  it('parses pa11y issues', () => {
    const json = JSON.stringify([
      { code: 'WCAG2AA.X', type: 'error', message: 'missing alt' },
      { code: 'WCAG2AA.Y', type: 'warning', message: 'low contrast' },
      { code: 'WCAG2AA.Z', type: 'notice', message: 'review needed' },
    ]);
    const findings = parsePa11yJson(json, 't1');
    expect(findings).toHaveLength(3);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[1]?.severity).toBe('medium');
    expect(findings[2]?.severity).toBe('low');
  });
});
