import { exec, hasDocker, which } from './exec.js';

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
    description: 'TLS/SSL local audit',
    preferred: 'local',
    modes: { local: { darwin: 'brew install testssl' } },
    verify: { local: { cmd: 'testssl', args: ['--version'] } },
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
    description: 'PHP Mess Detector',
    preferred: 'docker',
    modes: { docker: { image: 'cytopia/phpmd', tag: 'latest', sizeMB: 80 } },
    verify: { docker: { image: 'cytopia/phpmd', tag: 'latest' } },
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

export type InstallStep = {
  scanner: string;
  mode: 'local' | 'docker';
  command: string[];
  /** Pour info user: humain. */
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
      return shellStep(scanner, 'local', local.darwin);
    }
    if (process.platform === 'linux' && local.linux) {
      if (available.includes('apt') && local.linux.apt) return shellStep(scanner, 'local', local.linux.apt, true);
      if (available.includes('dnf') && local.linux.dnf) return shellStep(scanner, 'local', local.linux.dnf, true);
      if (available.includes('pacman') && local.linux.pacman) return shellStep(scanner, 'local', local.linux.pacman, true);
    }
    if (available.includes('npm') && local.npm) return shellStep(scanner, 'local', local.npm);
    if (available.includes('pip') && local.pip) return shellStep(scanner, 'local', local.pip);
    if (local.script) return shellStep(scanner, 'local', local.script);
  }

  if (recipe.modes.docker) return dockerStep(scanner, recipe.modes.docker);
  return null;
}

function shellStep(scanner: string, mode: 'local' | 'docker', cmd: string, needsSudo = false): InstallStep {
  return {
    scanner,
    mode,
    command: ['sh', '-c', cmd],
    pretty: cmd,
    needsSudo,
  };
}

function dockerStep(scanner: string, d: DockerInstall): InstallStep {
  const ref = `${d.image}:${d.tag}`;
  const step: InstallStep = {
    scanner,
    mode: 'docker',
    command: ['docker', 'pull', ref],
    pretty: `docker pull ${ref}`,
    needsSudo: false,
  };
  if (d.sizeMB !== undefined) step.approxSizeMB = d.sizeMB;
  return step;
}

export function listKnownScanners(): string[] {
  return Object.keys(REGISTRY).sort();
}
