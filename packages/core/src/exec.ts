import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

const whichCache = new Map<string, string | null>();

export function which(cmd: string): string | null {
  if (whichCache.has(cmd)) return whichCache.get(cmd) ?? null;
  const pathEnv = process.env.PATH ?? '';
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        accessSync(full, constants.X_OK);
        whichCache.set(cmd, full);
        return full;
      } catch {
        /* not here */
      }
    }
  }
  whichCache.set(cmd, null);
  return null;
}

export function clearWhichCache(): void {
  whichCache.clear();
}

export function hasDocker(): boolean {
  return which('docker') !== null;
}

export type ExecOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  input?: string;
  /** Liste des codes de sortie considérés comme succès. Défaut: [0]. Certains scanners renvoient 1 quand findings. */
  okExitCodes?: number[];
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export class ExecError extends Error {
  constructor(
    message: string,
    public readonly result: ExecResult,
    public readonly cmd: string[],
  ) {
    super(message);
    this.name = 'ExecError';
  }
}

export function exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  if (cmd.length === 0) throw new Error('exec: empty command');
  const [bin, ...args] = cmd as [string, ...string[]];
  const okCodes = opts.okExitCodes ?? [0];
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;

    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new ExecError(
            `exec timeout after ${opts.timeoutMs}ms: ${cmd.join(' ')}`,
            { stdout, stderr, exitCode: -1, durationMs: Date.now() - start },
            cmd,
          ),
        );
      }, opts.timeoutMs);
    }

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const result: ExecResult = {
        stdout,
        stderr,
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
      };
      if (okCodes.includes(result.exitCode)) {
        resolve(result);
      } else {
        reject(
          new ExecError(
            `exec failed (exit ${result.exitCode}): ${cmd.join(' ')}\n${stderr.slice(0, 500)}`,
            result,
            cmd,
          ),
        );
      }
    });
  });
}

export type DockerRunSpec = {
  image: string;
  /** Args passés à l'image (entrypoint). */
  args: string[];
  /** Volumes à monter. Les paths host sont résolus en absolu. */
  volumes?: Array<{ host: string; container: string; readonly?: boolean }>;
  /** Workdir dans le container. */
  workdir?: string;
  /** Variables d'env à passer (-e). */
  env?: Record<string, string>;
  /** User ID (-u). Défaut: $(id -u):$(id -g) sur Linux pour éviter root sur les fichiers générés. */
  user?: string;
  /** Mode réseau (-network). */
  network?: 'host' | 'bridge' | 'none';
  /** Args supplémentaires bruts pour `docker run`. */
  extra?: string[];
};

export function buildDockerRun(spec: DockerRunSpec): string[] {
  const cmd: string[] = ['docker', 'run', '--rm'];
  if (spec.user) cmd.push('-u', spec.user);
  if (spec.workdir) cmd.push('-w', spec.workdir);
  if (spec.network) cmd.push('--network', spec.network);
  for (const v of spec.volumes ?? []) {
    const host = path.resolve(v.host);
    const ro = v.readonly ? ':ro' : '';
    cmd.push('-v', `${host}:${v.container}${ro}`);
  }
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    cmd.push('-e', `${k}=${v}`);
  }
  if (spec.extra) cmd.push(...spec.extra);
  cmd.push(spec.image, ...spec.args);
  return cmd;
}

/**
 * Exécute un scanner soit en local (binaire) soit via Docker.
 * Stratégie: si binaire local trouvé → local, sinon Docker fallback.
 */
export type HybridSpec = {
  localBin: string;
  localArgs: string[];
  docker: DockerRunSpec;
  exec?: ExecOptions;
};

export async function execHybrid(spec: HybridSpec): Promise<ExecResult & { mode: 'local' | 'docker' }> {
  if (which(spec.localBin)) {
    const result = await exec([spec.localBin, ...spec.localArgs], spec.exec);
    return { ...result, mode: 'local' };
  }
  if (!hasDocker()) {
    throw new Error(
      `Tool "${spec.localBin}" not found locally and Docker not available. Install ${spec.localBin} or Docker.`,
    );
  }
  const cmd = buildDockerRun(spec.docker);
  const result = await exec(cmd, spec.exec);
  return { ...result, mode: 'docker' };
}
