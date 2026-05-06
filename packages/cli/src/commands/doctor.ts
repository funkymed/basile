import { Command, Flags } from '@oclif/core';
import boxen from 'boxen';
import {
  detectPackageManagers,
  hasDocker,
  listKnownScanners,
  theme,
  verifyMany,
  ICON,
} from '@basile/core';
import { printBanner } from '../ui/banner.js';
import { renderStatusTable } from '../ui/table.js';

export default class Doctor extends Command {
  static override description = 'Diagnostique l\'environnement BASILE et l\'état des scanners';

  static override flags = {
    quiet: Flags.boolean({ char: 'q', description: 'Mode silencieux (pas de banner)', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);

    if (!flags.quiet) {
      await printBanner();
    }

    const node = process.versions.node;
    const docker = hasDocker();
    const pms = detectPackageManagers();

    const lines = [
      `${theme.bold('Node')}     ${node.startsWith('20') || Number(node.split('.')[0]) >= 20 ? theme.success(ICON.ok) : theme.error(ICON.fail)} ${node}`,
      `${theme.bold('Docker')}   ${docker ? theme.success(ICON.ok) : theme.warn(ICON.warn)} ${docker ? 'disponible' : 'non détecté'}`,
      `${theme.bold('PMs')}      ${pms.length > 0 ? theme.success(pms.join(', ')) : theme.warn('aucun détecté')}`,
    ];

    process.stdout.write(
      `${boxen(lines.join('\n'), {
        title: 'Environnement',
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })}\n\n`,
    );

    const scanners = listKnownScanners();
    const statuses = await verifyMany(scanners);
    process.stdout.write(`${theme.bold('Scanners')} (${statuses.length})\n`);
    process.stdout.write(`${renderStatusTable(statuses)}\n`);

    const ready = statuses.filter((s) => s.ready).length;
    const total = statuses.length;
    process.stdout.write(`\n${theme.dim(`${ready}/${total} scanners prêts`)}\n`);
  }
}
