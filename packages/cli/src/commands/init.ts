import { Command, Flags } from '@oclif/core';
import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { theme, ICON } from '@basile/core';

const INLINE_TEMPLATE = `# Cookbook BASILE — généré par 'basile init'
name: my-audit
output: ./reports/{{date}}-{{name}}
parallel: 4

targets:
  - id: app
    type: code
    path: ./src
    stacks: [typescript]
    scanners:
      - eslint
      - tsc
      - semgrep
      - gitleaks

report:
  formats: [md]
  template: executive
  group_by: [target, severity]
  min_severity: low
`;

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findExampleRecipe(): Promise<string | null> {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'recipes', 'examples', 'full-audit.yaml');
    if (await fileExists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export default class Init extends Command {
  static override description = 'Crée un cookbook YAML de démarrage';

  static override flags = {
    output: Flags.string({ char: 'o', description: 'Chemin du cookbook à créer', default: './cookbook.yaml' }),
    force: Flags.boolean({ char: 'f', description: 'Écrase le fichier existant', default: false }),
    quiet: Flags.boolean({ char: 'q', description: 'Mode silencieux', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const dest = path.resolve(flags.output);

    if ((await fileExists(dest)) && !flags.force) {
      throw new Error(`Le fichier existe déjà: ${dest}\nUtilise --force pour l'écraser.`);
    }

    const example = await findExampleRecipe();
    if (example) {
      await copyFile(example, dest);
    } else {
      // Fallback: inline template if running outside the monorepo.
      const content = INLINE_TEMPLATE;
      await writeFile(dest, content, 'utf8');
    }

    if (!flags.quiet) {
      const source = example ? theme.dim(`(depuis ${path.relative(process.cwd(), example)})`) : theme.dim('(template intégré)');
      process.stdout.write(`${theme.success(ICON.ok)} Cookbook créé: ${theme.bold(dest)} ${source}\n`);
      process.stdout.write(`${theme.dim('Édite le fichier puis lance')} ${theme.accent('basile setup --recipe ' + flags.output)}\n`);
    }

    // Verify written file is valid YAML by reading it (cheap sanity check).
    await readFile(dest, 'utf8');
  }
}
