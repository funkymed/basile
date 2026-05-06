import { Command, Flags } from '@oclif/core';
import boxen from 'boxen';
import * as p from '@clack/prompts';
import {
  exec,
  ExecError,
  listKnownScanners,
  loadRecipe,
  listScannersInRecipe,
  preflight,
  theme,
  verifyMany,
  ICON,
  type InstallStep,
  type PreflightResult,
} from '@basile/core';
import { printBanner } from '../ui/banner.js';
import { renderStatusTable } from '../ui/table.js';

type StepOutcome = { step: InstallStep; status: 'ok' | 'fail' | 'skip'; error?: string };

export default class Setup extends Command {
  static override description = 'Vérifie et installe les scanners requis (interactif ou non)';

  static override flags = {
    recipe: Flags.string({ char: 'r', description: 'Chemin vers un cookbook YAML' }),
    scanners: Flags.string({ char: 's', description: 'Liste de scanners CSV (override recipe)' }),
    yes: Flags.boolean({ char: 'y', description: 'Installe sans confirmation', default: false }),
    'non-interactive': Flags.boolean({ description: 'Échoue sans prompts si manquants', default: false }),
    quiet: Flags.boolean({ char: 'q', description: 'Mode silencieux', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Setup);

    if (!flags.quiet) {
      await printBanner();
    }

    // 1. Determine target scanners list.
    const scanners = await this.resolveScanners(flags);
    if (scanners.length === 0) {
      throw new Error('Aucun scanner à vérifier. Fournis --recipe ou --scanners.');
    }

    // 2. Run preflight.
    const result = await preflight({ kind: 'list', scanners });

    if (result.ok) {
      process.stdout.write(`${theme.success(theme.bold(`${ICON.ok} Tous les scanners sont prêts (${result.ready.length}/${scanners.length}).`))}\n`);
      return;
    }

    // 3. Show status table.
    process.stdout.write(`${renderStatusTable(result.statuses)}\n\n`);

    if (result.unknown.length > 0) {
      process.stdout.write(
        `${theme.warn(`${ICON.warn} Scanners inconnus du registry`)}: ${result.unknown.join(', ')}\n\n`,
      );
    }

    if (result.installPlan.length === 0) {
      process.stdout.write(`${theme.warn('Aucun plan d\'installation disponible pour les scanners manquants.')}\n`);
      this.exit(2);
    }

    // 4. Non-interactive without --yes → print commands and bail.
    const interactive = process.stdout.isTTY && !flags['non-interactive'];

    if (!interactive && !flags.yes) {
      process.stdout.write(`${theme.bold('Commandes à exécuter manuellement :')}\n`);
      for (const step of result.installPlan) {
        const sudo = step.needsSudo ? theme.warn('[sudo] ') : '';
        process.stdout.write(`  ${theme.accent('$')} ${sudo}${step.pretty}\n`);
      }
      this.exit(2);
    }

    // 5. Execute install plan.
    const outcomes: StepOutcome[] = [];
    for (const step of result.installPlan) {
      const outcome = await this.runStep(step, { interactive, yes: flags.yes });
      outcomes.push(outcome);
    }

    // 6. Re-verify.
    const finalStatuses = await verifyMany(result.scanners);
    process.stdout.write(`\n${renderStatusTable(finalStatuses)}\n`);

    this.printSummary(outcomes, result, finalStatuses);
  }

  private async resolveScanners(flags: {
    recipe?: string | undefined;
    scanners?: string | undefined;
  }): Promise<string[]> {
    if (flags.recipe) {
      const recipe = await loadRecipe(flags.recipe);
      return listScannersInRecipe(recipe);
    }
    if (flags.scanners) {
      return flags.scanners
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return listKnownScanners();
  }

  private async runStep(
    step: InstallStep,
    opts: { interactive: boolean; yes: boolean },
  ): Promise<StepOutcome> {
    const sudoWarn = step.needsSudo ? theme.warn(' (sudo requis)') : '';
    const sizeWarn =
      step.approxSizeMB && step.approxSizeMB > 100
        ? theme.warn(` (~${step.approxSizeMB} MB)`)
        : '';

    if (opts.interactive && !opts.yes) {
      const ok = await p.confirm({
        message: `Installer ${theme.bold(step.scanner)} via \`${step.pretty}\`${sudoWarn}${sizeWarn} ?`,
        initialValue: true,
      });
      if (p.isCancel(ok) || !ok) {
        return { step, status: 'skip' };
      }
      if (step.approxSizeMB && step.approxSizeMB > 100) {
        const confirm = await p.confirm({
          message: `Téléchargement volumineux (~${step.approxSizeMB} MB). Confirmer ?`,
          initialValue: true,
        });
        if (p.isCancel(confirm) || !confirm) {
          return { step, status: 'skip' };
        }
      }
    }

    const spinner = p.spinner();
    spinner.start(`Installation de ${step.scanner}…`);
    try {
      await exec(step.command, { timeoutMs: 600_000 });
      spinner.stop(`${theme.success(ICON.ok)} ${step.scanner} installé`);
      return { step, status: 'ok' };
    } catch (err) {
      const msg = err instanceof ExecError ? err.message : err instanceof Error ? err.message : String(err);
      spinner.stop(`${theme.error(ICON.fail)} ${step.scanner} échec`);
      return { step, status: 'fail', error: msg };
    }
  }

  private printSummary(
    outcomes: StepOutcome[],
    result: PreflightResult,
    finalStatuses: Awaited<ReturnType<typeof verifyMany>>,
  ): void {
    const ok = outcomes.filter((o) => o.status === 'ok').length;
    const fail = outcomes.filter((o) => o.status === 'fail').length;
    const skip = outcomes.filter((o) => o.status === 'skip').length;
    const stillMissing = finalStatuses.filter((s) => !s.ready).map((s) => s.scanner);

    const lines = [
      `${theme.success(ICON.ok)} Installés : ${theme.bold(String(ok))}`,
      `${theme.error(ICON.fail)} Échecs    : ${theme.bold(String(fail))}`,
      `${theme.dim('⊘')} Skip       : ${theme.bold(String(skip))}`,
    ];
    if (stillMissing.length > 0) {
      lines.push('');
      lines.push(theme.warn(`Scanners encore manquants : ${stillMissing.join(', ')}`));
    } else {
      lines.push('');
      lines.push(theme.success('Tous les scanners requis sont prêts.'));
    }

    process.stdout.write(
      `\n${boxen(lines.join('\n'), {
        title: 'Résumé setup',
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'round',
        borderColor: fail > 0 ? 'red' : 'green',
      })}\n`,
    );

    // Reference the original input to silence "unused" lint when result needs to stay in signature.
    void result;

    if (fail > 0) {
      this.exit(1);
    }
  }
}
