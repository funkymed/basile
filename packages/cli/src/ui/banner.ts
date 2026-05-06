import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import { theme } from '@basile/core';

// Resolve package.json relative to this compiled file (dist/ui/banner.js → ../../package.json)
async function readVersion(): Promise<string> {
  try {
    const here = fileURLToPath(import.meta.url);
    const pkgPath = path.resolve(path.dirname(here), '..', '..', 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function isDisabled(): boolean {
  if (process.env.NO_COLOR) return true;
  if (!process.stdout.isTTY) return true;
  return false;
}

export async function printBanner(): Promise<void> {
  if (isDisabled()) return;

  const version = await readVersion();
  const ascii = figlet.textSync('BASILE', { font: 'ANSI Shadow' });
  const colored = gradient(['#22d3ee', '#a855f7'])(ascii);

  const subtitle = `${theme.dim('Audit multi-stack à la carte')}  ${theme.accent(`v${version}`)}`;

  const content = `${colored}\n${subtitle}`;

  const boxed = boxen(content, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: 'magenta',
  });

  process.stdout.write(`${boxed}\n`);
}
