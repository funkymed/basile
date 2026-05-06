import { describe, it, expect } from 'vitest';
import { mapSeverity, coerceCategory, withDefaults } from './normalize.js';

describe('mapSeverity', () => {
  it('maps known aliases', () => {
    expect(mapSeverity('error')).toBe('high');
    expect(mapSeverity('WARNING')).toBe('medium');
    expect(mapSeverity(2)).toBe('high');
    expect(mapSeverity(1)).toBe('medium');
  });
  it('uses fallback for unknown', () => {
    expect(mapSeverity('weird')).toBe('medium');
    expect(mapSeverity(undefined, 'low')).toBe('low');
  });
});

describe('coerceCategory', () => {
  it('accepts known categories', () => {
    expect(coerceCategory('security')).toBe('security');
    expect(coerceCategory('A11Y')).toBe('a11y');
  });
  it('falls back on unknown', () => {
    expect(coerceCategory('foo')).toBe('quality');
    expect(coerceCategory(null, 'performance')).toBe('performance');
  });
});

describe('withDefaults', () => {
  it('fills scanner/target/message defaults', () => {
    const f = withDefaults({ message: 'oops' }, 'eslint', 't1');
    expect(f.scanner).toBe('eslint');
    expect(f.target).toBe('t1');
    expect(f.severity).toBe('medium');
    expect(f.category).toBe('quality');
  });

  it('preserves provided fields', () => {
    const f = withDefaults(
      { severity: 'high', category: 'security', file: 'a.ts', line: 3, rule: 'x' },
      'eslint',
      't1',
    );
    expect(f.severity).toBe('high');
    expect(f.file).toBe('a.ts');
    expect(f.line).toBe(3);
    expect(f.rule).toBe('x');
  });
});
