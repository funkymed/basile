import { Help, Command } from '@oclif/core';
import { theme } from '@basile/core';
import { printBanner } from './ui/banner.js';

function footer(): string {
  const lines = [
    '',
    theme.dim('────────────────────────────────────────────────'),
    `${theme.bold('Auteur')}      Cyril Pereira`,
    `${theme.bold('GitHub')}      ${theme.accent('https://github.com/funkymed/basile')}`,
    `${theme.bold('Issues')}      ${theme.accent('https://github.com/funkymed/basile/issues')}`,
    `${theme.bold('Licence')}     MIT`,
    `${theme.bold('Docs')}        ${theme.accent('https://github.com/funkymed/basile#readme')}`,
    '',
    theme.dim('Astuce: '),
    `  ${theme.dim('•')} ${theme.accent('basile <command> -h')}    voir l'aide d'une commande`,
    `  ${theme.dim('•')} ${theme.accent('basile doctor')}          vérifier l'environnement`,
    `  ${theme.dim('•')} ${theme.accent('basile init')}            générer un cookbook.yaml`,
    '',
  ];
  return lines.join('\n');
}

export default class BasileHelp extends Help {
  override async showRootHelp(): Promise<void> {
    await printBanner();
    await super.showRootHelp();
    this.log(footer());
  }

  override async showCommandHelp(command: Command.Loadable): Promise<void> {
    await printBanner();
    await super.showCommandHelp(command);
    this.log(footer());
  }
}
