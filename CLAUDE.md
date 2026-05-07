# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BASILE — multi-stack audit CLI (PHP/Symfony, WordPress, TS/React/Node, prod URLs). Consolidates findings into MD/PDF, **no LLM calls**, deterministic. Spec: `docs/rfc/RFC-001-audit-multi-stack.md`.

## Commands

pnpm workspaces mono-repo. Node >=20, pnpm 9.

```bash
pnpm install
pnpm -r build           # build all packages
pnpm -r typecheck
pnpm -r test            # vitest
pnpm -r lint
pnpm pack:cli           # bundle self-contained tarball via scripts/pack.mjs
```

Single package: `pnpm --filter @basile/core build`. Single test: `pnpm --filter <pkg> test -- <file>`.

CLI dev entry: `node packages/cli/dist/bin/run.js <cmd>`. Commands: `doctor | init | list-scanners | setup | scan | report`.

## Architecture

Workspace layout (`pnpm-workspace.yaml`): `packages/*`, `packages/scanners/*`, `packages/reporters/*`.

- **core** — `Finding` / `Recipe` types, Zod schemas, `exec` wrapper, installers, preflight, theme
- **cli** — oclif commands + `registry.ts` (scanner discovery point)
- **runner** — listr2 orchestrator, `Scanner` interface, `ScannerRegistry`
- **scanners/** — one package per tool (`@basile/scanner-<name>`)
- **reporters/markdown** — Handlebars + writeReport (md + ndjson + meta.json), templates copied from root `templates/`
- **reporters/pdf** — Pandoc (eisvogel) wrapper

### Scanner adapter contract

```ts
interface Scanner {
  readonly name: string;
  readonly category: Category;
  readonly supports: (target: RecipeTarget) => boolean;
  run(target: RecipeTarget, opts: ScanOptions): Promise<Finding[]>;
}
```

Add scanner = new `@basile/scanner-<name>` package + register in `packages/cli/src/registry.ts`.

### Hybrid local/Docker exec

`exec.execHybrid()` in core: `which` detects local binary, falls back to Docker auto-mount. `which` is process-cached. Docker is the default for PHP/Ruby/Java tools (rarely standard on dev machines); local for JS / brew tools.

### Run output layout

`reports/<run>/raw/*.json`, `findings.ndjson`, `report.md`, `meta.json`, optional `report.pdf`. `basile report --from <run>` re-renders without re-scanning.

### UI modes (`--ui`)

`pretty` (TTY default, listr2) | `plain` (CI verbose, no ANSI) | `json` (NDJSON pipe) | `quiet`.

## Conventions

- English for code (vars, comments). French only for UI / CLI strings (i18n).
- Documentation (README.md, docs/, CONTRIBUTING.md): English.
- No local Docker except for non-iso scanners (PHP, ZAP, wpscan, wapiti)
- Branches: `feat/rfc-XXX` — Commits: `feat(rfc-XXX): ...`, `fix(scanner-X): ...`
- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (see `tsconfig.base.json`)

## RFCs

| ID | Title | Status |
|----|-------|--------|
| RFC-001 | Multi-stack audit | in progress |
