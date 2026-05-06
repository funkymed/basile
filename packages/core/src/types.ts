import { z } from 'zod';

export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof Severity>;

export const Category = z.enum([
  'security',
  'quality',
  'performance',
  'a11y',
  'deps',
  'secrets',
  'privacy',
]);
export type Category = z.infer<typeof Category>;

export const Stack = z.enum([
  'php',
  'symfony',
  'wordpress',
  'typescript',
  'react',
  'nodejs',
  'url',
]);
export type Stack = z.infer<typeof Stack>;

export const TargetType = z.enum(['code', 'url']);
export type TargetType = z.infer<typeof TargetType>;

export const Finding = z.object({
  scanner: z.string(),
  category: Category,
  severity: Severity,
  target: z.string(),
  file: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  rule: z.string().optional(),
  cwe: z.string().optional(),
  owasp: z.string().optional(),
  message: z.string(),
  raw: z.unknown().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
  info: 0,
};

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
