# TypeScript / React / Node directory scan

Ad-hoc audit of a TS/JS project. 100% local for most scanners.

## Case 1 — TS quality audit

```bash
basile scan --target ./apps/web \
  --stacks typescript,react \
  --scanners eslint,tsc,knip,madge
```

Covers: lint (eslint), types (tsc), dead code (knip), circular deps (madge).

## Case 2 — Node dependency audit

```bash
basile scan --target ./apps/api \
  --stacks nodejs \
  --scanners npm-audit,depcheck,trivy
```

CVEs (npm-audit), unused / missing deps (depcheck), SCA + secrets (trivy).

## Case 3 — TS/Node security audit

```bash
basile scan --target ./apps/api \
  --stacks typescript,nodejs \
  --scanners semgrep,bearer,gitleaks,npm-audit,trivy
```

## Case 4 — Full TS/React stack

```bash
basile scan --target ./apps/web \
  --stacks typescript,react \
  --scanners eslint,tsc,knip,madge,depcheck,npm-audit,semgrep,bearer,gitleaks,trivy,cloc
```

## Prerequisites

```bash
basile setup --stack typescript,react,nodejs --yes
```

Installs (npm/brew): `eslint`, `typescript`, `knip`, `depcheck`, `madge`, `semgrep`, `bearer`, `gitleaks`, `trivy`, `cloc`. `npm-audit` is built into npm.

## Tip — JSON output for CI

```bash
basile scan --target ./apps/web \
  --stacks typescript,react \
  --scanners eslint,tsc \
  --ui json > findings.ndjson
```

## See also

- [`code-php-scan.md`](code-php-scan.md)
- [`multistack-cookbook.md`](multistack-cookbook.md)
- [`../scanners.md`](../scanners.md)
