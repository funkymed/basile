import { describe, it, expect } from 'vitest';
import type { Finding, RecipeTarget } from '@basile/core';
import { ScannerRegistry } from './registry.js';
import type { Scanner } from './types.js';

const codeTarget: RecipeTarget = {
  id: 't1',
  type: 'code',
  path: '/tmp',
  stacks: ['typescript'],
  scanners: ['eslint', 'phpstan'],
};

const eslint: Scanner = {
  name: 'eslint',
  category: 'quality',
  supports: (t) => t.type === 'code' && t.stacks.includes('typescript'),
  run: async (): Promise<Finding[]> => [],
};

const phpstan: Scanner = {
  name: 'phpstan',
  category: 'quality',
  supports: (t) => t.type === 'code' && t.stacks.includes('php'),
  run: async (): Promise<Finding[]> => [],
};

describe('ScannerRegistry', () => {
  it('register/get/list', () => {
    const r = new ScannerRegistry();
    r.register(eslint);
    expect(r.get('eslint')).toBe(eslint);
    expect(r.list()).toHaveLength(1);
    expect(r.has('eslint')).toBe(true);
  });

  it('throws on duplicate registration', () => {
    const r = new ScannerRegistry();
    r.register(eslint);
    expect(() => r.register(eslint)).toThrow(/already registered/);
  });

  it('resolveForTarget filters by support and registration', () => {
    const r = new ScannerRegistry();
    r.register(eslint).register(phpstan);
    const resolved = r.resolveForTarget(codeTarget);
    expect(resolved.map((s) => s.name)).toEqual(['eslint']);
  });

  it('missingForTarget reports unregistered names', () => {
    const r = new ScannerRegistry();
    r.register(eslint);
    expect(r.missingForTarget(codeTarget)).toEqual(['phpstan']);
  });
});
