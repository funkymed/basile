# Contributing to BASILE

## Stack

TypeScript / Node 20+ / pnpm 9 workspaces. Vitest for tests. oclif for CLI. listr2 for orchestration. Zod for validation. Handlebars + Pandoc for reporting.

## Local setup

```bash
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
pnpm -r lint
```

Dev CLI: `node packages/cli/dist/bin/run.js <cmd>`.

Single-package tests: `pnpm --filter @basile/core test`. Watch: `pnpm --filter @basile/core test -- --watch`.

## Mono-repo layout

```
packages/
├── core/                  # Finding/Recipe types, Zod schemas, exec wrapper, installers, preflight
├── cli/                   # oclif: doctor, init, list-scanners, setup, scan, report
│   └── src/registry.ts    # ⬅ scanner registration entry point
├── runner/                # listr2 orchestrator + Scanner interface + ScannerRegistry
├── scanners/<name>/       # one package per scanner: @basile/scanner-<name>
└── reporters/
    ├── markdown/          # Handlebars + writeReport (md + ndjson + meta.json)
    └── pdf/               # Pandoc wrapper (eisvogel)

templates/                 # executive.hbs, technical.hbs, security.hbs
recipes/examples/          # sample cookbooks
docs/                      # user docs
docs/internal/             # maintainer docs
scripts/pack.mjs           # self-contained CLI bundle (npx)
```

## Architecture

### Scanner interface

```ts
interface Scanner {
  readonly name: string;
  readonly category: Category;
  readonly supports: (target: RecipeTarget) => boolean;
  run(target: RecipeTarget, opts: ScanOptions): Promise<Finding[]>;
}
```

`Finding` (normalized) is the common output shape across scanners — serialized to `findings.ndjson`, aggregated by reporters.

### Local / Docker hybrid

`exec.execHybrid()` (in `@basile/core`): `which` detects local binary (process-cached), otherwise auto Docker fallback with target volume mount.

PHP / Ruby / Java → Docker by default. JS / brew tools → local.

### Run pipeline

1. CLI parses flags / loads cookbook
2. Preflight: checks required tools, offers install
3. Runner (listr2) resolves targets × scanners, dispatches via `Scanner.supports`
4. Parallel execution (`parallel` from cookbook)
5. Findings aggregated → md/pdf reporters
6. Writes `reports/<run>/{raw,findings.ndjson,meta.json,report.md,report.pdf}`

## Adding a scanner

1. Create `packages/scanners/<name>/` with `package.json` (`@basile/scanner-<name>`), `tsconfig.json` extending `tsconfig.base.json`, `src/index.ts`
2. Implement `Scanner`:
   ```ts
   export const myScanner: Scanner = {
     name: 'my-scanner',
     category: 'sast',
     supports: (t) => t.type === 'code' && t.stacks?.includes('php'),
     async run(target, opts) {
       const out = await execHybrid({ bin: 'mytool', dockerImage: 'org/mytool', args: [...], cwd: target.path });
       return parseFindings(out.stdout);
     },
   };
   ```
3. Map native output to `Finding[]` (severity, message, file, line, rule)
4. Register in `packages/cli/src/registry.ts`
5. Vitest tests with fixtures under `__fixtures__/`
6. Update [`docs/scanners.md`](docs/scanners.md) (one row in the table)

## Conventions

- **Code**: English (variables, comments). **UI / CLI strings**: French (i18n).
- **Branches**: `feat/*`, `fix/scanner-<name>-<bug>`
- **Commits**: `feat(*): ...`, `fix(scanner-X): ...`, `docs: ...`
- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- No local Docker except for non-iso scanners (PHP, ZAP, wpscan)

## Release & npm publish

See [`docs/internal/release.md`](docs/internal/release.md).
