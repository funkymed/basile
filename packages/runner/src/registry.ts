import type { RecipeTarget } from '@basile/core';
import type { Scanner } from './types.js';

/** In-memory registry of scanners keyed by name. */
export class ScannerRegistry {
  private readonly scanners = new Map<string, Scanner>();

  register(scanner: Scanner): this {
    if (this.scanners.has(scanner.name)) {
      throw new Error(`Scanner déjà enregistré: ${scanner.name}`);
    }
    this.scanners.set(scanner.name, scanner);
    return this;
  }

  get(name: string): Scanner | undefined {
    return this.scanners.get(name);
  }

  list(): Scanner[] {
    return [...this.scanners.values()];
  }

  has(name: string): boolean {
    return this.scanners.has(name);
  }

  /** Returns the scanners declared by the target that are registered AND accept the target. */
  resolveForTarget(target: RecipeTarget): Scanner[] {
    const out: Scanner[] = [];
    for (const declared of target.scanners) {
      const s = this.scanners.get(declared);
      if (!s) continue;
      if (!s.supports(target)) continue;
      out.push(s);
    }
    return out;
  }

  /** Returns scanner names declared by the target but missing from the registry. */
  missingForTarget(target: RecipeTarget): string[] {
    return target.scanners.filter((n) => !this.scanners.has(n));
  }
}
