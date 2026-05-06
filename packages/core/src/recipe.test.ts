import { describe, expect, it } from 'vitest';
import { listScannersInRecipe, loadRecipeFromString, RecipeValidationError, resolveOutputDir } from './recipe.js';

const VALID = `
name: demo
output: ./reports/{{date}}-{{name}}
parallel: 2
targets:
  - id: api
    type: code
    path: ./apps/api
    stacks: [php, symfony]
    scanners: [phpstan, semgrep]
  - id: prod
    type: url
    url: https://example.com
    scanners: [lighthouse, headers]
`;

describe('recipe', () => {
  it('parses a valid recipe', () => {
    const r = loadRecipeFromString(VALID);
    expect(r.name).toBe('demo');
    expect(r.targets).toHaveLength(2);
  });

  it('lists unique sorted scanners', () => {
    const r = loadRecipeFromString(VALID);
    expect(listScannersInRecipe(r)).toEqual(['headers', 'lighthouse', 'phpstan', 'semgrep']);
  });

  it('substitutes {{date}} and {{name}}', () => {
    const r = loadRecipeFromString(VALID);
    const out = resolveOutputDir(r, new Date('2026-05-06'));
    expect(out).toBe('./reports/2026-05-06-demo');
  });

  it('rejects unknown stack', () => {
    expect(() =>
      loadRecipeFromString(`
name: bad
targets:
  - id: x
    type: code
    path: ./
    stacks: [cobol]
    scanners: [phpstan]
`),
    ).toThrow(RecipeValidationError);
  });

  it('rejects empty scanners', () => {
    expect(() =>
      loadRecipeFromString(`
name: bad
targets:
  - id: x
    type: code
    path: ./
    stacks: [php]
    scanners: []
`),
    ).toThrow(RecipeValidationError);
  });

  it('rejects invalid url', () => {
    expect(() =>
      loadRecipeFromString(`
name: bad
targets:
  - id: x
    type: url
    url: not-a-url
    scanners: [lighthouse]
`),
    ).toThrow(RecipeValidationError);
  });
});
