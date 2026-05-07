import { Command, Flags } from '@oclif/core';
import Table from 'cli-table3';
import { listKnownScanners, REGISTRY, theme } from '@basile/core';
import { printBanner } from '../ui/banner.js';

type Group = 'php' | 'js' | 'web' | 'universal' | 'wordpress';

const CATEGORY_MAP: Record<string, Group> = {
  // PHP
  phpstan: 'php',
  phpcs: 'php',
  phpmd: 'php',
  'composer-audit': 'php',
  // JS / Node
  eslint: 'js',
  tsc: 'js',
  knip: 'js',
  depcheck: 'js',
  madge: 'js',
  'npm-audit': 'js',
  // Web / URL
  lighthouse: 'web',
  pa11y: 'web',
  'zap-baseline': 'web',
  nuclei: 'web',
  wapiti: 'web',
  'ssllabs-scan': 'web',
  testssl: 'web',
  headers: 'web',
  // WordPress
  wpscan: 'wordpress',
  // Universal
  semgrep: 'universal',
  trivy: 'universal',
  gitleaks: 'universal',
  bearer: 'universal',
  cloc: 'universal',
};

const GROUP_LABEL: Record<Group, string> = {
  php: 'PHP / Symfony',
  js: 'JavaScript / TypeScript',
  web: 'Web / URL',
  universal: 'Multi-language',
  wordpress: 'WordPress',
};

const GROUP_ORDER: Group[] = ['universal', 'js', 'php', 'web', 'wordpress'];

export default class ListScanners extends Command {
  static override description = 'List all known scanners, grouped by category';
  static override aliases = ['scanners'];

  static override flags = {
    quiet: Flags.boolean({ char: 'q', description: 'Quiet mode', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ListScanners);
    if (!flags.quiet) {
      await printBanner();
    }

    const groups = new Map<Group, string[]>();
    for (const name of listKnownScanners()) {
      const g = CATEGORY_MAP[name] ?? 'universal';
      const arr = groups.get(g) ?? [];
      arr.push(name);
      groups.set(g, arr);
    }

    for (const group of GROUP_ORDER) {
      const items = groups.get(group);
      if (!items || items.length === 0) continue;

      process.stdout.write(`\n${theme.bold(theme.accent(GROUP_LABEL[group]))}\n`);
      const table = new Table({
        head: [theme.bold('Scanner'), theme.bold('Mode'), theme.bold('Description')],
        style: { head: [], border: [] },
      });
      for (const name of items) {
        const recipe = REGISTRY[name];
        if (!recipe) continue;
        table.push([name, recipe.preferred, theme.dim(recipe.description)]);
      }
      process.stdout.write(`${table.toString()}\n`);
    }
  }
}
