import { exec, which, type Category, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type LhrAudit = {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode?: string;
};

type LhrCategoryRef = { id: string; auditRefs: Array<{ id: string; group?: string }> };

type Lhr = {
  audits: Record<string, LhrAudit>;
  categories?: Record<string, LhrCategoryRef>;
};

export const lighthouseScanner: Scanner = {
  name: 'lighthouse',
  category: 'performance',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!which('lighthouse')) {
      throw new Error('Binaire "lighthouse" introuvable. Installer Lighthouse CLI.');
    }
    const cmd = [
      'lighthouse',
      target.url,
      '--output=json',
      '--quiet',
      '--chrome-flags=--headless --no-sandbox',
    ];
    const { stdout } = await exec(cmd, { okExitCodes: [0] });
    return parseLighthouseLhr(stdout, target.id);
  },
};

/** Builds a map auditId → category ('performance' | 'a11y' | 'quality'). */
function buildAuditClassification(lhr: Lhr): Map<string, Category> {
  const map = new Map<string, Category>();
  const categories = lhr.categories ?? {};
  for (const [catId, cat] of Object.entries(categories)) {
    for (const ref of cat.auditRefs ?? []) {
      let mapped: Category = 'quality';
      if (catId === 'performance' || ref.group === 'metrics') mapped = 'performance';
      else if (catId === 'accessibility') mapped = 'a11y';
      map.set(ref.id, mapped);
    }
  }
  return map;
}

/** Parses Lighthouse JSON (LHR) into Findings for audits scoring below 0.9. */
export function parseLighthouseLhr(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie Lighthouse invalide (JSON parse): ${(e as Error).message}`);
  }
  const lhr = parsed as Lhr;
  if (!lhr || typeof lhr !== 'object' || !lhr.audits) return [];

  const classification = buildAuditClassification(lhr);
  const findings: Finding[] = [];

  for (const [id, audit] of Object.entries(lhr.audits)) {
    const score = audit.score;
    if (typeof score !== 'number') continue;
    if (score >= 0.9) continue;
    const severity: Severity = score < 0.5 ? 'high' : 'medium';
    const category: Category = classification.get(id) ?? 'quality';
    const message = [audit.title, audit.description].filter(Boolean).join(' — ');
    findings.push({
      scanner: 'lighthouse',
      category,
      severity,
      target: targetId,
      rule: id,
      message,
      raw: audit,
    });
  }
  return findings;
}
