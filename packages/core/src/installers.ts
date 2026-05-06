import { exec, hasDocker, which } from './exec.js';
import type { Category, Stack } from './types.js';

export type ScannerCategory = Category | 'sast' | 'dast' | 'lint';

/**
 * Static metadata used for filtering scanners by stack or category in the CLI
 * (`--stack php`, `--category dast`, etc.). Keys mirror REGISTRY keys.
 */
export const SCANNER_META: Record<string, { stacks: Stack[]; categories: ScannerCategory[] }> = {
  eslint: { stacks: ['typescript', 'react', 'nodejs'], categories: ['quality', 'lint', 'sast'] },
  tsc: { stacks: ['typescript', 'react', 'nodejs'], categories: ['quality', 'lint'] },
  knip: { stacks: ['typescript', 'react', 'nodejs'], categories: ['quality', 'deps'] },
  depcheck: { stacks: ['typescript', 'react', 'nodejs'], categories: ['deps'] },
  madge: { stacks: ['typescript', 'react', 'nodejs'], categories: ['quality'] },
  'npm-audit': { stacks: ['typescript', 'react', 'nodejs'], categories: ['deps', 'security'] },
  lighthouse: { stacks: ['url'], categories: ['performance', 'a11y', 'quality'] },
  pa11y: { stacks: ['url'], categories: ['a11y'] },
  'zap-baseline': { stacks: ['url'], categories: ['security', 'dast'] },
  nuclei: { stacks: ['url'], categories: ['security', 'dast'] },
  wapiti: { stacks: ['url'], categories: ['security', 'dast'] },
  'ssllabs-scan': { stacks: ['url'], categories: ['security'] },
  testssl: { stacks: ['url'], categories: ['security'] },
  headers: { stacks: ['url'], categories: ['security'] },
  semgrep: { stacks: ['php', 'symfony', 'typescript', 'react', 'nodejs', 'wordpress'], categories: ['security', 'sast'] },
  trivy: { stacks: ['php', 'symfony', 'typescript', 'react', 'nodejs', 'wordpress'], categories: ['security', 'deps', 'secrets'] },
  gitleaks: { stacks: ['php', 'symfony', 'typescript', 'react', 'nodejs', 'wordpress'], categories: ['secrets', 'security'] },
  bearer: { stacks: ['php', 'symfony', 'typescript', 'react', 'nodejs'], categories: ['privacy', 'security', 'sast'] },
  cloc: { stacks: ['php', 'symfony', 'typescript', 'react', 'nodejs', 'wordpress'], categories: ['quality'] },
  phpstan: { stacks: ['php', 'symfony'], categories: ['quality', 'sast'] },
  phpcs: { stacks: ['php', 'symfony'], categories: ['quality', 'lint'] },
  phpmd: { stacks: ['php', 'symfony'], categories: ['quality', 'sast'] },
  'composer-audit': { stacks: ['php', 'symfony'], categories: ['deps', 'security'] },
  wpscan: { stacks: ['wordpress'], categories: ['security', 'dast'] },
};

export type LocalInstall = {
  darwin?: string;
  linux?: { apt?: string; dnf?: string; pacman?: string };
  npm?: string;
  pip?: string;
  script?: string;
};

export type DockerInstall = {
  image: string;
  tag: string;
  /** Approx download size in MB. Used to warn user. */
  sizeMB?: number;
};

export type Verify = {
  /** Local: cmd binary name + flag (ex: phpstan --version) */
  local?: { cmd: string; args: string[]; minVersion?: string };
  /** Docker: image present locally? */
  docker?: { image: string; tag: string };
};

export type InstallRecipe = {
  scanner: string;
  description: string;
  /** Mode préféré si les deux disponibles. */
  preferred: 'local' | 'docker';
  modes: {
    local?: LocalInstall;
    docker?: DockerInstall;
  };
  verify: Verify;
};

export type InstallStatus = {
  scanner: string;
  local: 'present' | 'absent' | 'na';
  docker: 'present' | 'absent' | 'na';
  ready: boolean;
};

export const REGISTRY: Record<string, InstallRecipe> = {
  // ---- JS / Node ----
  eslint: {
    scanner: 'eslint',
    description: 'JS/TS linter',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g eslint' } },
    verify: { local: { cmd: 'eslint', args: ['--version'] } },
  },
  tsc: {
    scanner: 'tsc',
    description: 'TypeScript compiler (typecheck)',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g typescript' } },
    verify: { local: { cmd: 'tsc', args: ['--version'] } },
  },
  knip: {
    scanner: 'knip',
    description: 'Dead code & unused deps',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g knip' } },
    verify: { local: { cmd: 'knip', args: ['--version'] } },
  },
  depcheck: {
    scanner: 'depcheck',
    description: 'Unused npm dependencies',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g depcheck' } },
    verify: { local: { cmd: 'depcheck', args: ['--version'] } },
  },
  madge: {
    scanner: 'madge',
    description: 'Module dependency graph + cycles',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g madge' } },
    verify: { local: { cmd: 'madge', args: ['--version'] } },
  },
  'npm-audit': {
    scanner: 'npm-audit',
    description: 'npm vulnerability audit (built-in)',
    preferred: 'local',
    modes: { local: {} },
    verify: { local: { cmd: 'npm', args: ['--version'] } },
  },

  // ---- Web / URL ----
  lighthouse: {
    scanner: 'lighthouse',
    description: 'Perf / SEO / a11y / best practices URL audit',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g lighthouse' } },
    verify: { local: { cmd: 'lighthouse', args: ['--version'] } },
  },
  pa11y: {
    scanner: 'pa11y',
    description: 'A11y audit URL (WCAG)',
    preferred: 'local',
    modes: { local: { npm: 'npm i -g pa11y' } },
    verify: { local: { cmd: 'pa11y', args: ['--version'] } },
  },
  'zap-baseline': {
    scanner: 'zap-baseline',
    description: 'OWASP ZAP baseline DAST scan',
    preferred: 'docker',
    modes: { docker: { image: 'ghcr.io/zaproxy/zaproxy', tag: 'stable', sizeMB: 1200 } },
    verify: { docker: { image: 'ghcr.io/zaproxy/zaproxy', tag: 'stable' } },
  },
  nuclei: {
    scanner: 'nuclei',
    description: 'Templated DAST scanner',
    preferred: 'local',
    modes: {
      local: {
        darwin: 'brew install nuclei',
        linux: { apt: 'snap install nuclei' },
      },
      docker: { image: 'projectdiscovery/nuclei', tag: 'latest', sizeMB: 200 },
    },
    verify: { local: { cmd: 'nuclei', args: ['-version'] } },
  },
  wapiti: {
    scanner: 'wapiti',
    description: 'Python DAST scanner',
    preferred: 'docker',
    modes: { docker: { image: 'cyberwatch/wapiti', tag: 'latest', sizeMB: 400 } },
    verify: { docker: { image: 'cyberwatch/wapiti', tag: 'latest' } },
  },
  'ssllabs-scan': {
    scanner: 'ssllabs-scan',
    description: 'SSL Labs CLI scan',
    preferred: 'local',
    modes: { local: { darwin: 'brew install ssllabs-scan' } },
    verify: { local: { cmd: 'ssllabs-scan', args: ['-version'] } },
  },
  testssl: {
    scanner: 'testssl',
    description: 'TLS/SSL local audit (testssl.sh)',
    preferred: 'local',
    modes: {
      local: {
        darwin: 'brew install testssl',
        linux: { apt: 'apt-get install -y testssl.sh' },
        script: 'git clone --depth 1 https://github.com/drwetter/testssl.sh.git ~/.testssl && sudo ln -sf ~/.testssl/testssl.sh /usr/local/bin/testssl.sh',
      },
    },
    // Brew installe le binaire sous le nom `testssl.sh`, pas `testssl`.
    verify: { local: { cmd: 'testssl.sh', args: ['--version'] } },
  },
  headers: {
    scanner: 'headers',
    description: 'HTTP security headers (curl built-in)',
    preferred: 'local',
    modes: { local: {} },
    verify: { local: { cmd: 'curl', args: ['--version'] } },
  },

  // ---- Multi-language ----
  semgrep: {
    scanner: 'semgrep',
    description: 'Multi-language SAST',
    preferred: 'local',
    modes: {
      local: {
        darwin: 'brew install semgrep',
        linux: { apt: 'pip install semgrep', dnf: 'pip install semgrep' },
        pip: 'pip install semgrep',
      },
      docker: { image: 'returntocorp/semgrep', tag: 'latest', sizeMB: 350 },
    },
    verify: { local: { cmd: 'semgrep', args: ['--version'] } },
  },
  trivy: {
    scanner: 'trivy',
    description: 'Vuln + secret + IaC scanner',
    preferred: 'local',
    modes: {
      local: {
        darwin: 'brew install trivy',
        linux: { apt: 'apt-get install trivy', dnf: 'dnf install trivy' },
      },
      docker: { image: 'aquasec/trivy', tag: 'latest', sizeMB: 250 },
    },
    verify: { local: { cmd: 'trivy', args: ['--version'] } },
  },
  gitleaks: {
    scanner: 'gitleaks',
    description: 'Secret scanner (git history)',
    preferred: 'local',
    modes: {
      local: { darwin: 'brew install gitleaks' },
      docker: { image: 'zricethezav/gitleaks', tag: 'latest', sizeMB: 50 },
    },
    verify: { local: { cmd: 'gitleaks', args: ['version'] } },
  },
  bearer: {
    scanner: 'bearer',
    description: 'Privacy/PII + security SAST',
    preferred: 'local',
    modes: {
      local: {
        darwin: 'brew install bearer/tap/bearer',
        script: 'curl -sfL https://raw.githubusercontent.com/Bearer/bearer/main/contrib/install.sh | sh',
      },
      docker: { image: 'bearer/bearer', tag: 'latest-amd64', sizeMB: 500 },
    },
    verify: { local: { cmd: 'bearer', args: ['version'] } },
  },
  cloc: {
    scanner: 'cloc',
    description: 'Lines of code stats',
    preferred: 'local',
    modes: { local: { darwin: 'brew install cloc', linux: { apt: 'apt-get install cloc' } } },
    verify: { local: { cmd: 'cloc', args: ['--version'] } },
  },

  // ---- PHP / Symfony ----
  phpstan: {
    scanner: 'phpstan',
    description: 'PHP static analysis',
    preferred: 'docker',
    modes: { docker: { image: 'ghcr.io/phpstan/phpstan', tag: 'latest', sizeMB: 200 } },
    verify: { docker: { image: 'ghcr.io/phpstan/phpstan', tag: 'latest' } },
  },
  phpcs: {
    scanner: 'phpcs',
    description: 'PHP CodeSniffer',
    preferred: 'docker',
    modes: { docker: { image: 'cytopia/phpcs', tag: 'latest', sizeMB: 80 } },
    verify: { docker: { image: 'cytopia/phpcs', tag: 'latest' } },
  },
  phpmd: {
    scanner: 'phpmd',
    description: 'PHP Mess Detector (via jakzal/phpqa toolbox)',
    preferred: 'docker',
    // cytopia/phpmd n'existe pas. jakzal/phpqa est l'image PHP QA de référence
    // (inclut phpmd, phpcs, phpstan, phpcpd, etc.). ~400MB mais réutilisable.
    modes: { docker: { image: 'jakzal/phpqa', tag: 'php8.3', sizeMB: 400 } },
    verify: { docker: { image: 'jakzal/phpqa', tag: 'php8.3' } },
  },
  'composer-audit': {
    scanner: 'composer-audit',
    description: 'composer audit (deps PHP)',
    preferred: 'docker',
    modes: { docker: { image: 'composer', tag: '2', sizeMB: 100 } },
    verify: { docker: { image: 'composer', tag: '2' } },
  },

  // ---- WordPress ----
  wpscan: {
    scanner: 'wpscan',
    description: 'WordPress vulnerability scanner',
    preferred: 'docker',
    modes: { docker: { image: 'wpscanteam/wpscan', tag: 'latest', sizeMB: 300 } },
    verify: { docker: { image: 'wpscanteam/wpscan', tag: 'latest' } },
  },
};

// ---------- OS / package manager detection ----------

export type PackageManager = 'brew' | 'apt' | 'dnf' | 'pacman' | 'npm' | 'pip' | null;

export function detectOS(): NodeJS.Platform {
  return process.platform;
}

export function detectPackageManagers(): PackageManager[] {
  const found: PackageManager[] = [];
  if (which('brew')) found.push('brew');
  if (which('apt-get')) found.push('apt');
  if (which('dnf')) found.push('dnf');
  if (which('pacman')) found.push('pacman');
  if (which('npm')) found.push('npm');
  if (which('pip3') || which('pip')) found.push('pip');
  return found;
}

// ---------- Verification ----------

export async function verify(scanner: string): Promise<InstallStatus> {
  const recipe = REGISTRY[scanner];
  if (!recipe) {
    return { scanner, local: 'na', docker: 'na', ready: false };
  }
  let local: InstallStatus['local'] = 'na';
  let docker: InstallStatus['docker'] = 'na';

  if (recipe.verify.local) {
    local = which(recipe.verify.local.cmd) ? 'present' : 'absent';
  }
  if (recipe.verify.docker) {
    docker = (await dockerImageExists(recipe.verify.docker.image, recipe.verify.docker.tag))
      ? 'present'
      : 'absent';
  }

  const ready =
    (recipe.preferred === 'local' && local === 'present') ||
    (recipe.preferred === 'docker' && docker === 'present') ||
    local === 'present' ||
    docker === 'present';

  return { scanner, local, docker, ready };
}

export async function verifyMany(scanners: string[]): Promise<InstallStatus[]> {
  return Promise.all(scanners.map(verify));
}

async function dockerImageExists(image: string, tag: string): Promise<boolean> {
  if (!hasDocker()) return false;
  try {
    await exec(['docker', 'image', 'inspect', `${image}:${tag}`], { okExitCodes: [0] });
    return true;
  } catch {
    return false;
  }
}

// ---------- Install command resolution ----------

export type InstallManager = 'brew' | 'apt' | 'dnf' | 'pacman' | 'npm' | 'pip' | 'docker' | 'script';

export type InstallStep = {
  scanner: string;
  mode: 'local' | 'docker';
  manager: InstallManager;
  /** For brew/npm/pip: the package name(s) to pass. For docker: image:tag. For script: full shell line. */
  pkg: string;
  command: string[];
  pretty: string;
  needsSudo: boolean;
  approxSizeMB?: number;
};

export function resolveInstallSteps(scanner: string, available: PackageManager[]): InstallStep | null {
  const recipe = REGISTRY[scanner];
  if (!recipe) return null;

  if (recipe.preferred === 'docker' && recipe.modes.docker) {
    return dockerStep(scanner, recipe.modes.docker);
  }

  if (recipe.modes.local) {
    const local = recipe.modes.local;
    if (process.platform === 'darwin' && available.includes('brew') && local.darwin) {
      return parseBrewStep(scanner, local.darwin);
    }
    if (process.platform === 'linux' && local.linux) {
      if (available.includes('apt') && local.linux.apt) return parsePmStep(scanner, 'apt', local.linux.apt, true);
      if (available.includes('dnf') && local.linux.dnf) return parsePmStep(scanner, 'dnf', local.linux.dnf, true);
      if (available.includes('pacman') && local.linux.pacman) return parsePmStep(scanner, 'pacman', local.linux.pacman, true);
    }
    if (available.includes('npm') && local.npm) return parseNpmStep(scanner, local.npm);
    if (available.includes('pip') && local.pip) return parsePipStep(scanner, local.pip);
    if (local.script) return scriptStep(scanner, local.script);
  }

  if (recipe.modes.docker) return dockerStep(scanner, recipe.modes.docker);
  return null;
}

/** Parse "brew install foo/tap/bar" → pkg="foo/tap/bar". */
function parseBrewStep(scanner: string, cmd: string): InstallStep {
  const pkg = cmd.replace(/^brew\s+install\s+(--cask\s+)?/, '').trim();
  return {
    scanner,
    mode: 'local',
    manager: 'brew',
    pkg,
    command: ['sh', '-c', cmd],
    pretty: cmd,
    needsSudo: false,
  };
}

function parseNpmStep(scanner: string, cmd: string): InstallStep {
  const pkg = cmd.replace(/^npm\s+(i|install)\s+(-g\s+)?/, '').trim();
  return { scanner, mode: 'local', manager: 'npm', pkg, command: ['sh', '-c', cmd], pretty: cmd, needsSudo: false };
}

function parsePipStep(scanner: string, cmd: string): InstallStep {
  const pkg = cmd.replace(/^pip3?\s+install\s+/, '').trim();
  return { scanner, mode: 'local', manager: 'pip', pkg, command: ['sh', '-c', cmd], pretty: cmd, needsSudo: false };
}

function parsePmStep(scanner: string, manager: 'apt' | 'dnf' | 'pacman', cmd: string, needsSudo: boolean): InstallStep {
  const re = manager === 'apt' ? /^apt(-get)?\s+install\s+(-y\s+)?/ : manager === 'dnf' ? /^dnf\s+install\s+(-y\s+)?/ : /^pacman\s+-S\s+(--noconfirm\s+)?/;
  const pkg = cmd.replace(re, '').trim();
  return { scanner, mode: 'local', manager, pkg, command: ['sh', '-c', cmd], pretty: cmd, needsSudo };
}

function scriptStep(scanner: string, cmd: string): InstallStep {
  return { scanner, mode: 'local', manager: 'script', pkg: cmd, command: ['sh', '-c', cmd], pretty: cmd, needsSudo: false };
}

function dockerStep(scanner: string, d: DockerInstall): InstallStep {
  const ref = `${d.image}:${d.tag}`;
  const step: InstallStep = {
    scanner,
    mode: 'docker',
    manager: 'docker',
    pkg: ref,
    command: ['docker', 'pull', ref],
    pretty: `docker pull ${ref}`,
    needsSudo: false,
  };
  if (d.sizeMB !== undefined) step.approxSizeMB = d.sizeMB;
  return step;
}

// ---------- Batching ----------

export type StepBatch = {
  manager: InstallManager;
  steps: InstallStep[];
  /** Combined command (single shell exec for brew/npm/apt/dnf/pacman/pip/script). For docker: empty (steps run individually). */
  command: string[] | null;
  pretty: string;
  needsSudo: boolean;
  approxSizeMB: number;
};

/**
 * Group install steps by package manager so we can run a single command
 * per group instead of one per scanner. Massively reduces install time.
 *
 *   brew install A B C D   (1 cmd vs 4)
 *   npm i -g X Y Z         (1 cmd vs 3)
 *   docker pull img1       (parallelized with concurrency cap)
 *   docker pull img2
 *
 * `script` and `pip` (different package syntaxes vary) are batched only when
 * compatible; here we keep them per-step for safety.
 */
export function batchInstallSteps(steps: InstallStep[]): StepBatch[] {
  const groups = new Map<InstallManager, InstallStep[]>();
  for (const step of steps) {
    const arr = groups.get(step.manager) ?? [];
    arr.push(step);
    groups.set(step.manager, arr);
  }

  const batches: StepBatch[] = [];
  for (const [manager, items] of groups) {
    if (manager === 'docker' || manager === 'script') {
      // Docker: keep separate to enable parallel pulls. Scripts: each is its own shell line.
      for (const s of items) {
        batches.push({
          manager,
          steps: [s],
          command: s.command,
          pretty: s.pretty,
          needsSudo: s.needsSudo,
          approxSizeMB: s.approxSizeMB ?? 0,
        });
      }
      continue;
    }

    const pkgs = items.map((s) => s.pkg).join(' ');
    let cmd = '';
    let needsSudo = false;
    switch (manager) {
      case 'brew':
        cmd = `brew install ${pkgs}`;
        break;
      case 'npm':
        cmd = `npm i -g ${pkgs}`;
        break;
      case 'pip':
        cmd = `pip install ${pkgs}`;
        break;
      case 'apt':
        cmd = `apt-get install -y ${pkgs}`;
        needsSudo = true;
        break;
      case 'dnf':
        cmd = `dnf install -y ${pkgs}`;
        needsSudo = true;
        break;
      case 'pacman':
        cmd = `pacman -S --noconfirm ${pkgs}`;
        needsSudo = true;
        break;
    }
    batches.push({
      manager,
      steps: items,
      command: ['sh', '-c', cmd],
      pretty: cmd,
      needsSudo,
      approxSizeMB: items.reduce((acc, s) => acc + (s.approxSizeMB ?? 0), 0),
    });
  }

  // Stable order: native pkg managers first (fastest), then npm/pip, then docker (slowest).
  const order: InstallManager[] = ['brew', 'apt', 'dnf', 'pacman', 'npm', 'pip', 'script', 'docker'];
  batches.sort((a, b) => order.indexOf(a.manager) - order.indexOf(b.manager));
  return batches;
}

// ---------- Stack/category filters ----------

export function filterScannersByStack(scanners: string[], stacks: Stack[]): string[] {
  if (stacks.length === 0) return scanners;
  const stackSet = new Set(stacks);
  return scanners.filter((s) => {
    const meta = SCANNER_META[s];
    if (!meta) return false;
    return meta.stacks.some((st) => stackSet.has(st));
  });
}

export function filterScannersByCategory(scanners: string[], categories: ScannerCategory[]): string[] {
  if (categories.length === 0) return scanners;
  const catSet = new Set(categories);
  return scanners.filter((s) => {
    const meta = SCANNER_META[s];
    if (!meta) return false;
    return meta.categories.some((c) => catSet.has(c));
  });
}

export function listKnownScanners(): string[] {
  return Object.keys(REGISTRY).sort();
}
