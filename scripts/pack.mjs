#!/usr/bin/env node
/**
 * Builds a self-contained npm tarball of the BASILE CLI installable via:
 *   npx ./basile-X.Y.Z.tgz
 *   npm i -g ./basile-X.Y.Z.tgz
 *
 * Steps:
 *  1. pnpm -r build
 *  2. pnpm --filter @basile/cli deploy ./deploy/cli --prod
 *  3. Rewrite deploy/cli/package.json:
 *     - name: basile
 *     - private: false
 *     - workspace:* → resolved versions (from each package's package.json)
 *     - bundleDependencies: [all @basile/*]
 *     - Strip devDependencies + scripts
 *  4. Materialize node_modules/@basile/* as real folders (pnpm uses symlinks
 *     by default; npm pack does not follow symlinks for bundledDependencies).
 *  5. npm pack --pack-destination <repo-root>
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, cpSync, rmSync, existsSync, statSync, realpathSync, chmodSync, unlinkSync } from 'node:fs';
import { readdirSync } from 'node:fs';

/**
 * pnpm uses hardlinks from its content-addressable store. Writing directly to
 * a hardlinked file mutates EVERY linked file (including source files in the
 * workspace). To safely modify a file in deploy/, we must unlink it first
 * (breaking the hardlink) then write a fresh file.
 */
function safeWriteFile(filePath, content) {
  try {
    unlinkSync(filePath);
  } catch {
    /* file may not exist yet */
  }
  writeFileSync(filePath, content);
}
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY = path.join(ROOT, 'deploy', 'cli');
const NM = path.join(DEPLOY, 'node_modules');

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

console.log('▸ Build all packages');
sh('pnpm -r build');

console.log('▸ Clean previous deploy');
rmSync(DEPLOY, { recursive: true, force: true });

console.log('▸ Deploy @basile/cli (shamefully hoisted for npm compat)');
sh('pnpm --filter @basile/cli deploy ./deploy/cli --prod --config.node-linker=hoisted --config.shamefully-hoist=true');

console.log('▸ Materialize all symlinked packages (flatten pnpm layout)');
function materializeDir(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.pnpm' || entry === '.bin' || entry === '.modules.yaml') continue;
    const full = path.join(dir, entry);
    if (entry.startsWith('@')) {
      materializeDir(full);
      continue;
    }
    const stat = statSync(full);
    if (stat.isSymbolicLink() || (stat.isDirectory() && realpathSync(full) !== full)) {
      const real = realpathSync(full);
      rmSync(full, { recursive: true, force: true });
      cpSync(real, full, { recursive: true, dereference: true });
    }
  }
}
materializeDir(NM);

console.log('▸ Collect all top-level node_modules packages for bundling');
function collectTopLevel(dir, scope = '') {
  const names = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.pnpm' || entry === '.bin' || entry === '.modules.yaml') continue;
    const full = path.join(dir, entry);
    if (entry.startsWith('@')) {
      names.push(...collectTopLevel(full, entry));
      continue;
    }
    if (statSync(full).isDirectory()) {
      names.push(scope ? `${scope}/${entry}` : entry);
    }
  }
  return names;
}
const allBundled = collectTopLevel(NM);
console.log(`  · ${allBundled.length} packages to bundle`);

console.log('▸ Rewrite workspace:* in all bundled @basile/* packages');
function rewriteWorkspaceRefs(pkgJsonPath, version) {
  const obj = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (!obj[field]) continue;
    for (const [k, v] of Object.entries(obj[field])) {
      if (typeof v === 'string' && v.startsWith('workspace:')) {
        obj[field][k] = version;
      }
    }
  }
  safeWriteFile(pkgJsonPath, JSON.stringify(obj, null, 2));
}
const corePkgEarly = JSON.parse(readFileSync(path.join(ROOT, 'packages/core/package.json'), 'utf8'));
const basileScopeDir = path.join(NM, '@basile');
if (existsSync(basileScopeDir)) {
  for (const entry of readdirSync(basileScopeDir)) {
    rewriteWorkspaceRefs(path.join(basileScopeDir, entry, 'package.json'), corePkgEarly.version);
  }
}

console.log('▸ Rewrite package.json');
const pkgPath = path.join(DEPLOY, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const corePkg = JSON.parse(readFileSync(path.join(ROOT, 'packages/core/package.json'), 'utf8'));

const basileDeps = Object.keys(pkg.dependencies).filter((d) => d.startsWith('@basile/'));
for (const dep of basileDeps) {
  pkg.dependencies[dep] = corePkg.version;
}

pkg.name = '@funkymed/basile';
pkg.publishConfig = { access: 'public' };
pkg.private = false;
pkg.license = 'MIT';
pkg.author = 'Cyril Pereira <https://github.com/funkymed>';
pkg.repository = 'github:funkymed/basile';
pkg.homepage = 'https://github.com/funkymed/basile#readme';
pkg.bugs = 'https://github.com/funkymed/basile/issues';
pkg.keywords = ['audit', 'security', 'sast', 'dast', 'lighthouse', 'cli', 'phpstan', 'semgrep', 'bearer', 'owasp', 'wpscan', 'trivy', 'gitleaks', 'zap'];
pkg.files = ['dist', 'LICENSE', 'README.md'];
delete pkg.devDependencies;
pkg.scripts = {};
// Bundle EVERYTHING that's in node_modules so the tarball is fully self-contained.
// We must also declare each as a regular dep so npm/npx accept the install.
for (const dep of allBundled) {
  if (!pkg.dependencies[dep]) {
    try {
      const depPkg = JSON.parse(readFileSync(path.join(NM, dep, 'package.json'), 'utf8'));
      pkg.dependencies[dep] = depPkg.version ?? '*';
    } catch {
      pkg.dependencies[dep] = '*';
    }
  }
}
pkg.bundleDependencies = allBundled;

safeWriteFile(pkgPath, JSON.stringify(pkg, null, 2));

console.log('▸ Copy README + LICENSE from repo root');
for (const f of ['README.md', 'LICENSE']) {
  const src = path.join(ROOT, f);
  if (existsSync(src)) {
    cpSync(src, path.join(DEPLOY, f));
  } else {
    console.warn(`  ! ${f} missing at repo root, skipping`);
  }
}

console.log('▸ chmod +x bin');
const binPath = path.join(DEPLOY, 'dist', 'bin', 'run.js');
chmodSync(binPath, 0o755);

console.log('▸ npm pack');
sh(`npm pack --pack-destination "${ROOT}"`, { cwd: DEPLOY });

// Resolve produced tarball name (npm uses `${scope-or-name}-${version}.tgz`).
const safeName = pkg.name.replace(/^@/, '').replace('/', '-');
const tarballName = `${safeName}-${pkg.version}.tgz`;

console.log('\n✔ Tarball ready at repo root. Test:');
console.log(`  npx ./${tarballName} doctor`);
console.log(`  npm i -g ./${tarballName}`);
console.log('\nPublish to npmjs:');
console.log(`  npm publish ./${tarballName} --access public --registry=https://registry.npmjs.org/`);
