import { exec, ExecError, which, type Finding, type RecipeTarget, type Severity } from '@basile/core';
import type { Scanner } from '@basile/runner';

type Pa11yIssue = {
  code?: string;
  type?: string;
  typeCode?: number;
  message?: string;
  context?: string;
  selector?: string;
  runner?: string;
};

export const pa11yScanner: Scanner = {
  name: 'pa11y',
  category: 'a11y',

  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!which('pa11y')) {
      throw new Error('Binaire "pa11y" introuvable. Installer pa11y (npm i -g pa11y).');
    }
    const cmd = ['pa11y', '--reporter', 'json', '--threshold', '1000', target.url];
    let stdout: string;
    try {
      const r = await exec(cmd, { okExitCodes: [0, 2], timeoutMs: 2 * 60_000 });
      stdout = r.stdout;
    } catch (err) {
      if (err instanceof ExecError && err.result.stdout) {
        stdout = err.result.stdout;
      } else {
        throw err;
      }
    }
    return parsePa11yJson(stdout, target.id);
  },
};

function mapSeverity(t: string | undefined): Severity {
  switch ((t ?? '').toLowerCase()) {
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    case 'notice':
      return 'low';
    default:
      return 'low';
  }
}

export function parsePa11yJson(json: string, targetId: string): Finding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Sortie pa11y invalide (JSON parse): ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) return [];
  const issues = parsed as Pa11yIssue[];
  return issues.map((i) => {
    const f: Finding = {
      scanner: 'pa11y',
      category: 'a11y',
      severity: mapSeverity(i.type),
      target: targetId,
      message: i.message ?? i.code ?? 'a11y issue',
      raw: i,
    };
    if (i.code) f.rule = i.code;
    return f;
  });
}
