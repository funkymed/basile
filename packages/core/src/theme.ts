import pc from 'picocolors';
import type { Severity } from './types.js';

export const theme = {
  brand: pc.magentaBright,
  accent: pc.cyan,
  success: pc.green,
  warn: pc.yellow,
  error: pc.red,
  dim: pc.dim,
  bold: pc.bold,
  pending: pc.gray,
};

export const severityColor: Record<Severity, (s: string) => string> = {
  critical: (s) => pc.bgRed(pc.white(pc.bold(` ${s} `))),
  high: pc.red,
  medium: pc.yellow,
  low: pc.blue,
  info: pc.gray,
};

export const SEVERITY_ICON: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪',
};

export const ICON = {
  ok: '✔',
  fail: '✗',
  pending: '◌',
  running: '⠋',
  warn: '⚠',
  arrow: '→',
};
