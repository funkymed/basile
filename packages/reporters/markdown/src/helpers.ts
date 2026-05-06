import Handlebars from 'handlebars';
import type { Severity } from '@basile/core';
import { SEVERITY_ICON, severityColor } from '@basile/core';

export type HelperFlavor = 'markdown' | 'terminal';

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};

function severityBadgeMd(s: unknown): string {
  const sev = String(s) as Severity;
  const label = SEVERITY_LABEL[sev] ?? String(s).toUpperCase();
  const icon = SEVERITY_ICON[sev] ?? '';
  return `${icon} **${label}**`;
}

function severityBadgeTerminal(s: unknown): string {
  const sev = String(s) as Severity;
  const colorize = severityColor[sev];
  const label = SEVERITY_LABEL[sev] ?? String(s).toUpperCase();
  return colorize ? colorize(label) : label;
}

function severityIconHelper(s: unknown): string {
  const sev = String(s) as Severity;
  return SEVERITY_ICON[sev] ?? '';
}

function groupBy<T extends Record<string, unknown>>(
  array: T[] | undefined,
  key: string,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  if (!Array.isArray(array)) return out;
  for (const item of array) {
    const k = String(item[key] ?? 'unknown');
    (out[k] ??= []).push(item);
  }
  return out;
}

function truncate(str: unknown, n: unknown): string {
  const s = String(str ?? '');
  const len = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(len) || len <= 0) return s;
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function cweLink(cwe: unknown): string {
  if (!cwe) return '';
  const raw = String(cwe);
  const num = raw.replace(/^CWE-?/i, '').trim();
  if (!/^\d+$/.test(num)) return raw;
  return `[CWE-${num}](https://cwe.mitre.org/data/definitions/${num}.html)`;
}

function coverageBar(pct: unknown, width = 8): string {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  const empty = width - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${Math.round(p)}%`;
}

function sortBy<T extends Record<string, unknown>>(array: T[] | undefined, key: string): T[] {
  if (!Array.isArray(array)) return [];
  return [...array].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av ?? '').localeCompare(String(bv ?? ''));
  });
}

function count(array: unknown): number {
  return Array.isArray(array) ? array.length : 0;
}

const eq = (a: unknown, b: unknown): boolean => a === b;
const gt = (a: unknown, b: unknown): boolean => Number(a) > Number(b);
const lt = (a: unknown, b: unknown): boolean => Number(a) < Number(b);

/**
 * Register helpers on a Handlebars instance. Markdown flavor (default) emits
 * Markdown-friendly output (no ANSI). Terminal flavor uses ANSI colors for preview.
 */
export function registerHelpers(
  hb: typeof Handlebars = Handlebars,
  flavor: HelperFlavor = 'markdown',
): void {
  hb.registerHelper('severityBadge', flavor === 'terminal' ? severityBadgeTerminal : severityBadgeMd);
  hb.registerHelper('severityBadgeMd', severityBadgeMd);
  hb.registerHelper('severityBadgeTerminal', severityBadgeTerminal);
  hb.registerHelper('severityIcon', severityIconHelper);
  hb.registerHelper('groupBy', groupBy);
  hb.registerHelper('truncate', truncate);
  hb.registerHelper('cweLink', cweLink);
  hb.registerHelper('coverageBar', coverageBar);
  hb.registerHelper('sortBy', sortBy);
  hb.registerHelper('count', count);
  hb.registerHelper('eq', eq);
  hb.registerHelper('gt', gt);
  hb.registerHelper('lt', lt);
  hb.registerHelper('upper', (s: unknown) => String(s ?? '').toUpperCase());
  hb.registerHelper('json', (v: unknown) => JSON.stringify(v, null, 2));
}

export const helpers = {
  severityBadgeMd,
  severityBadgeTerminal,
  severityIcon: severityIconHelper,
  groupBy,
  truncate,
  cweLink,
  coverageBar,
  sortBy,
  count,
  eq,
  gt,
  lt,
};
