# Build & npm publish

> Maintainer doc. For end-user usage, see [`README.md`](../../README.md).

## Build

```bash
pnpm install
pnpm -r build           # compiles all packages (tsc → dist/)
pnpm -r typecheck
pnpm -r test
pnpm -r lint
```

Each package: `src/` → `dist/` (CommonJS via `tsconfig` extending `tsconfig.base.json`).

## Self-contained tarball

`scripts/pack.mjs` produces an npx-friendly tarball with the CLI + all workspaces inlined (~5.4 MB).

```bash
pnpm pack:cli
# → funkymed-basile-<version>.tgz at repo root
```

Smoke-test the tarball:
```bash
npx --package=file:./funkymed-basile-0.0.1.tgz basile doctor
# or
npm i -g ./funkymed-basile-0.0.1.tgz && basile --version
```

## npm publish

Public package: `@funkymed/basile`. Bin: `basile`.

### Prerequisites

- npm account with publish access to scope `@funkymed`
- `npm login`
- Git tag `v<version>` pushed
- Up-to-date changelog

### Versioning

Semver. Bump root `package.json` + every `packages/*/package.json` consistently.

```bash
# synchronized bump (manual for now)
# edit root package.json, then:
pnpm -r exec npm version <patch|minor|major> --no-git-tag-version
```

### Publish

Self-contained tarball (single public artifact):

```bash
pnpm pack:cli
npm publish ./funkymed-basile-<version>.tgz --access public
```

Dry-run:
```bash
npm publish ./funkymed-basile-<version>.tgz --dry-run
```

### Git tag + push

```bash
git tag v<version>
git push origin v<version>
```

## Release checklist

- [ ] `pnpm -r typecheck` ✓
- [ ] `pnpm -r test` ✓
- [ ] `pnpm -r lint` ✓
- [ ] Bump version (root + packages)
- [ ] Changelog updated
- [ ] `pnpm pack:cli` → tarball produced
- [ ] Smoke-test tarball locally (`npx --package=file:./...`)
- [ ] `npm publish --dry-run`
- [ ] `npm publish`
- [ ] Git tag + push
- [ ] GitHub release (notes copied from changelog)

## Rollback

`npm unpublish` is allowed only within 72h. Otherwise: publish a patch fix. Use `npm deprecate @funkymed/basile@<version> "<reason>"` to flag a broken version.
