import { Command, Flags } from '@oclif/core';
import boxen from 'boxen';
import {
  detectPackageManagers,
  hasDocker,
  listKnownScanners,
  theme,
  verifyMany,
  which,
  ICON,
} from '@basile/core';
import { printBanner } from '../ui/banner.js';
import { renderStatusTable } from '../ui/table.js';

export default class Doctor extends Command {
  static override description = 'Diagnose BASILE environment and scanner status';

  static override flags = {
    quiet: Flags.boolean({ char: 'q', description: 'Quiet mode (no banner)', default: false }),
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
      `${theme.bold('Docker')}   ${docker ? theme.success(ICON.ok) : theme.warn(ICON.warn)} ${docker ? 'available' : 'not detected'}`,
      `${theme.bold('PMs')}      ${pms.length > 0 ? theme.success(pms.join(', ')) : theme.warn('none detected')}`,
    ];

    process.stdout.write(
      `${boxen(lines.join('\n'), {
        title: 'Environment',
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
    process.stdout.write(`\n${theme.dim(`${ready}/${total} scanners ready`)}\n`);

    // Recon (RFC-002) — host-binary checks for the shortcut commands
    // (`subfinder`, `waf`, `recon`). These bypass the docker fallback so we
    // surface them separately from the scanner registry table.
    const reconBins = [
      { name: 'subfinder', purpose: 'subdomain enumeration' },
      { name: 'curl', purpose: 'HTTP probing' },
      { name: 'jq', purpose: 'JSON post-processing (optional)' },
    ];
    const reconLines = reconBins.map((b) => {
      const found = which(b.name) !== null;
      const icon = found
        ? theme.success(ICON.ok)
        : b.name === 'jq'
          ? theme.warn(ICON.warn)
          : theme.error(ICON.fail);
      return `${icon} ${theme.bold(b.name.padEnd(10))} ${theme.dim(b.purpose)}`;
    });
    process.stdout.write(
      `\n${boxen(reconLines.join('\n'), {
        title: 'Recon (RFC-002)',
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })}\n`,
    );
  }
}
