import { describe, expect, it } from 'vitest';
import { helpers } from './helpers.js';

describe('helpers (markdown flavor)', () => {
  it('severityBadgeMd contains label and icon, no ANSI', () => {
    const out = helpers.severityBadgeMd('critical');
    expect(out).toContain('CRITICAL');
    // Should not contain ANSI escape character
    expect(out).not.toMatch(/\[/);
  });

  it('cweLink builds a markdown link to mitre', () => {
    expect(helpers.cweLink('CWE-79')).toBe('[CWE-79](https://cwe.mitre.org/data/definitions/79.html)');
    expect(helpers.cweLink('79')).toBe('[CWE-79](https://cwe.mitre.org/data/definitions/79.html)');
    expect(helpers.cweLink('')).toBe('');
    expect(helpers.cweLink('weird')).toBe('weird');
  });

  it('coverageBar renders proportional bar with percent', () => {
    expect(helpers.coverageBar(0)).toMatch(/░{8} 0%/);
    expect(helpers.coverageBar(50)).toMatch(/█{4}░{4} 50%/);
    expect(helpers.coverageBar(100)).toMatch(/█{8} 100%/);
  });

  it('truncate respects length and adds ellipsis', () => {
    expect(helpers.truncate('hello world', 5)).toBe('hell…');
    expect(helpers.truncate('hi', 5)).toBe('hi');
  });

  it('groupBy groups items by key', () => {
    const arr = [
      { sev: 'high', m: 1 },
      { sev: 'low', m: 2 },
      { sev: 'high', m: 3 },
    ];
    const g = helpers.groupBy(arr as never, 'sev');
    expect(g['high']?.length).toBe(2);
    expect(g['low']?.length).toBe(1);
  });
});
