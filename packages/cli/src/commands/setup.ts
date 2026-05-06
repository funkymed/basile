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
  batchInstallSteps,
  filterScannersByStack,
  filterScannersByCategory,
  type StepBatch,
  type Stack,
  type ScannerCategory,
} from '@basile/core';
import { printBanner } from '../ui/banner.js';
import { renderStatusTable } from '../ui/table.js';

type BatchOutcome = { batch: StepBatch; status: 'ok' | 'fail' | 'skip'; error?: string; durationMs: number };

const VALID_STACKS: Stack[] = ['php', 'symfony', 'wordpress', 'typescript', 'react', 'nodejs', 'url'];
const VALID_CATEGORIES: ScannerCategory[] = ['security', 'quality', 'performance', 'a11y', 'deps', 'secrets', 'privacy', 'sast', 'dast', 'lint'];

export default class Setup extends Command {
  static override description = 'Vérifie et installe les scanners requis (batché par package manager, docker en parallèle)';

  static override examples = [
    'basile setup --recipe cookbook.yaml',
    'basile setup --stack php,symfony',
    'basile setup --category dast,sast --yes',
    'basile setup --scanners eslint,lighthouse,bearer',
    'basile setup --all --yes',
  ];

  static override flags = {
    recipe: Flags.string({ char: 'r', description: 'Cookbook YAML' }),
    scanners: Flags.string({ char: 's', description: 'Liste CSV de scanners' }),
    stack: Flags.string({ description: `Filtre par stack (CSV) parmi: ${VALID_STACKS.join(', ')}` }),
    category: Flags.string({ description: `Filtre par catégorie (CSV) parmi: ${VALID_CATEGORIES.join(', ')}` }),
    all: Flags.boolean({ description: 'Tous les scanners du registre', default: false }),
    yes: Flags.boolean({ char: 'y', description: 'Installe sans confirmation', default: false }),
    'non-interactive': Flags.boolean({ description: 'Échoue sans prompts si manquants', default: false }),
    'docker-concurrency': Flags.integer({ description: 'Nombre de docker pull simultanés', default: 3 }),
    quiet: Flags.boolean({ char: 'q', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Setup);
    if (!flags.quiet) await printBanner();

    const scanners = await this.resolveScanners(flags);
    if (scanners.length === 0) {
      this.error('Aucun scanner sélectionné. Précise --recipe, --scanners, --stack, --category, ou --all.', { exit: 1 });
    }

    const result = await preflight({ kind: 'list', scanners });

    if (result.ok) {
      process.stdout.write(`${theme.success(theme.bold(`${ICON.ok} Tous les scanners sont prêts (${result.ready.length}/${scanners.length}).`))}\n`);
      return;
    }

    if (!flags.quiet) {
      process.stdout.write(`${renderStatusTable(result.statuses)}\n\n`);
    }

    if (result.unknown.length > 0) {
      process.stdout.write(`${theme.warn(`${ICON.warn} Scanners inconnus`)}: ${result.unknown.join(', ')}\n\n`);
    }

    if (result.installPlan.length === 0) {
      process.stdout.write(`${theme.warn("Aucun plan d'installation disponible.")}\n`);
      this.exit(2);
    }

    const batches = batchInstallSteps(result.installPlan);

    // Single confirmation for the whole batch (vs one per scanner).
    const interactive = process.stdout.isTTY && !flags['non-interactive'];

    if (!flags.quiet) {
      this.printBatchPreview(batches);
    }

    if (!interactive && !flags.yes) {
      process.stdout.write(`\n${theme.bold('Commandes (mode non-interactif):')}\n`);
      for (const b of batches) {
        const sudo = b.needsSudo ? theme.warn('[sudo] ') : '';
        process.stdout.write(`  ${theme.accent('$')} ${sudo}${b.pretty}\n`);
      }
      this.exit(2);
    }

    if (interactive && !flags.yes) {
      const total = batches.reduce((acc, b) => acc + b.steps.length, 0);
      const totalMB = batches.reduce((acc, b) => acc + b.approxSizeMB, 0);
      const ok = await p.confirm({
        message: `Installer ${theme.bold(String(total))} outil(s) en ${theme.bold(String(batches.length))} commande(s)${
          totalMB > 0 ? ` (~${totalMB} MB téléchargement)` : ''
        } ?`,
        initialValue: true,
      });
      if (p.isCancel(ok) || !ok) {
        p.cancel('Annulé.');
        this.exit(1);
      }
    }

    // Execute batches: native PMs sequentially (already grouped into 1 cmd each),
    // docker pulls in parallel (capped).
    const outcomes = await this.runBatches(batches, flags['docker-concurrency']);

    const finalStatuses = await verifyMany(result.scanners);
    if (!flags.quiet) process.stdout.write(`\n${renderStatusTable(finalStatuses)}\n`);
    this.printSummary(outcomes, finalStatuses);
  }

  private async resolveScanners(flags: Record<string, unknown>): Promise<string[]> {
    let scanners: string[];

    if (typeof flags.recipe === 'string') {
      scanners = listScannersInRecipe(await loadRecipe(flags.recipe));
    } else if (typeof flags.scanners === 'string') {
      scanners = flags.scanners.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (flags.all) {
      scanners = listKnownScanners();
    } else if (typeof flags.stack === 'string' || typeof flags.category === 'string') {
      scanners = listKnownScanners();
    } else {
      return [];
    }

    if (typeof flags.stack === 'string') {
      const stacks = flags.stack.split(',').map((s) => s.trim()) as Stack[];
      scanners = filterScannersByStack(scanners, stacks);
    }
    if (typeof flags.category === 'string') {
      const cats = flags.category.split(',').map((s) => s.trim()) as ScannerCategory[];
      scanners = filterScannersByCategory(scanners, cats);
    }
    return scanners;
  }

  private printBatchPreview(batches: StepBatch[]): void {
    const lines: string[] = [theme.bold('Plan d\'installation batché')];
    for (const b of batches) {
      const tools = b.steps.map((s) => s.scanner).join(', ');
      const sudo = b.needsSudo ? theme.warn(' [sudo]') : '';
      const size = b.approxSizeMB > 0 ? theme.dim(` ~${b.approxSizeMB}MB`) : '';
      lines.push(`  ${theme.accent(b.manager.padEnd(7))} ${theme.dim('→')} ${theme.bold(String(b.steps.length))} outil(s)${sudo}${size}`);
      lines.push(`    ${theme.dim(tools)}`);
    }
    process.stdout.write(`${boxen(lines.join('\n'), { padding: 1, borderStyle: 'round', borderColor: 'cyan' })}\n`);
  }

  private async runBatches(batches: StepBatch[], dockerConcurrency: number): Promise<BatchOutcome[]> {
    const dockerBatches = batches.filter((b) => b.manager === 'docker');
    const nativeBatches = batches.filter((b) => b.manager !== 'docker');

    const outcomes: BatchOutcome[] = [];

    // 1. Native package managers: sequentially (each is already 1 grouped command).
    for (const b of nativeBatches) {
      outcomes.push(await this.execBatch(b));
    }

    // 2. Docker pulls: in parallel (capped).
    if (dockerBatches.length > 0) {
      const spinner = p.spinner();
      spinner.start(`${dockerBatches.length} docker pull en parallèle (${dockerConcurrency} simultanés)…`);
      let done = 0;
      const updateSpinner = (label: string) => {
        spinner.message(`docker [${done}/${dockerBatches.length}] · ${label}`);
      };

      const queue = [...dockerBatches];
      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(dockerConcurrency, queue.length); i++) {
        workers.push(
          (async () => {
            while (true) {
              const b = queue.shift();
              if (!b) return;
              const r = await this.execBatch(b, { silent: true });
              outcomes.push(r);
              done++;
              updateSpinner(b.steps[0]?.scanner ?? '');
            }
          })(),
        );
      }
      await Promise.all(workers);
      spinner.stop(`${theme.success(ICON.ok)} ${dockerBatches.length} images docker pullées`);
    }

    return outcomes;
  }

  private async execBatch(batch: StepBatch, opts: { silent?: boolean } = {}): Promise<BatchOutcome> {
    const start = Date.now();
    const tools = batch.steps.map((s) => s.scanner).join(', ');
    const spinner = opts.silent ? null : p.spinner();
    spinner?.start(`${batch.manager}: ${tools}`);
    try {
      if (!batch.command) throw new Error('Batch sans commande');
      await exec(batch.command, { timeoutMs: 1_200_000 });
      spinner?.stop(`${theme.success(ICON.ok)} ${batch.manager}: ${tools}`);
      return { batch, status: 'ok', durationMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof ExecError ? err.message : err instanceof Error ? err.message : String(err);
      spinner?.stop(`${theme.error(ICON.fail)} ${batch.manager}: ${tools}`);
      return { batch, status: 'fail', error: msg, durationMs: Date.now() - start };
    }
  }

  private printSummary(outcomes: BatchOutcome[], finalStatuses: Awaited<ReturnType<typeof verifyMany>>): void {
    const okScanners = outcomes.filter((o) => o.status === 'ok').flatMap((o) => o.batch.steps.map((s) => s.scanner));
    const failBatches = outcomes.filter((o) => o.status === 'fail');
    const stillMissing = finalStatuses.filter((s) => !s.ready).map((s) => s.scanner);
    const totalDuration = outcomes.reduce((acc, o) => acc + o.durationMs, 0);

    const lines = [
      `${theme.success(ICON.ok)} Installés : ${theme.bold(String(okScanners.length))}`,
      `${theme.error(ICON.fail)} Échecs    : ${theme.bold(String(failBatches.length))} batch(s)`,
      `${theme.dim('⏱')}  Durée     : ${theme.bold(`${(totalDuration / 1000).toFixed(1)}s`)}`,
    ];
    if (failBatches.length > 0) {
      lines.push('');
      lines.push(theme.error('Batches en échec :'));
      for (const f of failBatches) {
        lines.push(`  ${theme.dim('·')} ${f.batch.manager}: ${f.batch.steps.map((s) => s.scanner).join(', ')}`);
        if (f.error) lines.push(`    ${theme.dim(f.error.split('\n')[0]?.slice(0, 100) ?? '')}`);
      }
    }
    if (stillMissing.length > 0) {
      lines.push('');
      lines.push(theme.warn(`Encore manquants : ${stillMissing.join(', ')}`));
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
        borderColor: failBatches.length > 0 ? 'red' : 'green',
      })}\n`,
    );

    if (failBatches.length > 0) this.exit(1);
  }
}
