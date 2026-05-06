import { describe, it, expect } from 'vitest';
import { clocScanner, parseClocJson } from './index.js';

describe('clocScanner', () => {
  it('declares its identity', () => {
    expect(clocScanner.name).toBe('cloc');
    expect(clocScanner.category).toBe('quality');
  });

  it('parses cloc summary', () => {
    const json = JSON.stringify({
      header: { cloc_version: '1.0' },
      TypeScript: { nFiles: 3, blank: 10, comment: 5, code: 100 },
      SUM: { nFiles: 3, blank: 10, comment: 5, code: 100 },
    });
    const findings = parseClocJson(json, 't1');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'info',
      category: 'quality',
      rule: 'cloc-stats',
    });
    expect(findings[0]?.message).toContain('3 fichiers');
  });
});
