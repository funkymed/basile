import Table from 'cli-table3';
import { theme, ICON, type InstallStatus } from '@basile/core';

function presence(s: 'present' | 'absent' | 'na'): string {
  if (s === 'present') return theme.success(ICON.ok);
  if (s === 'absent') return theme.error(ICON.fail);
  return theme.dim('—');
}

function statusLabel(ready: boolean, local: string, docker: string): string {
  if (ready) return theme.success(theme.bold('READY'));
  if (local === 'na' && docker === 'na') return theme.warn('UNKNOWN');
  return theme.error(theme.bold('MISSING'));
}

export function renderStatusTable(statuses: InstallStatus[]): string {
  const table = new Table({
    head: [
      theme.bold('Scanner'),
      theme.bold('Local'),
      theme.bold('Docker'),
      theme.bold('Statut'),
    ],
    style: { head: [], border: [] },
  });

  for (const s of statuses) {
    table.push([
      s.scanner,
      presence(s.local),
      presence(s.docker),
      statusLabel(s.ready, s.local, s.docker),
    ]);
  }

  return table.toString();
}
