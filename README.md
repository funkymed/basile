# BASILE

À-la-carte multi-stack audit CLI. Scans source code (PHP/Symfony, WordPress, TypeScript/React/Node) and production URLs. Consolidates results into Markdown/PDF — **no LLM calls**, deterministic, reproducible.

> Full spec: [`docs/rfc/RFC-001-audit-multi-stack.md`](docs/rfc/RFC-001-audit-multi-stack.md) — Scanner catalog: [`docs/scanners.md`](docs/scanners.md) — Examples: [`docs/examples/`](docs/examples/) — Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## Installation

```bash
# Tarball (quick test, no global install)
pnpm pack:cli
npx --package=file:./basile-0.0.1.tgz basile doctor

# Global install
npm i -g ./basile-0.0.1.tgz
basile doctor
```

Dev mode (mono-repo): `pnpm install && pnpm -r build && node packages/cli/dist/bin/run.js doctor`.

---

## Quick start

```bash
basile init                                # generates cookbook.yaml
basile setup --recipe cookbook.yaml        # installs missing tools
basile scan --recipe cookbook.yaml         # preflight + scan + report
```

---

## Commands

| Command | Role |
|---------|------|
| `basile doctor` | Environment status (Node, Docker, package managers) + scanner availability |
| `basile list-scanners` | Lists known scanners grouped by category |
| `basile init` | Generates a starter `cookbook.yaml` |
| `basile setup` | Installs missing tools (batched per PM, Docker pulls in parallel) |
| `basile scan` | Runs a scan (recipe or ad-hoc) |
| `basile report` | Re-renders a previous run as MD/PDF without re-scanning |

---

## Usage modes

### 1. Without cookbook (ad-hoc)

Code target:
```bash
basile scan --target ./apps/api --stacks php,symfony --scanners phpstan,bearer
```

URL target:
```bash
basile scan --url https://example.com --scanners lighthouse,headers,zap-baseline
```

See [`docs/examples/code-php-scan.md`](docs/examples/code-php-scan.md), [`docs/examples/code-typescript-scan.md`](docs/examples/code-typescript-scan.md), [`docs/examples/url-quick-scan.md`](docs/examples/url-quick-scan.md).

### 2. With cookbook (declarative, recommended)

```bash
basile scan --recipe cookbook.yaml
basile scan --recipe cookbook.yaml --auto-install   # install missing tools at preflight
basile scan --recipe cookbook.yaml --skip-preflight # bypass tool check
```

See [`docs/examples/multistack-cookbook.md`](docs/examples/multistack-cookbook.md).

### 3. Single scanner

```bash
basile scan --target . --scanners gitleaks
basile scan --url https://example.com --scanners lighthouse
```

See [`docs/examples/single-scanner.md`](docs/examples/single-scanner.md).

---

## Scanners by stack

| Stack | Scanners |
|-------|----------|
| **PHP / Symfony** | phpstan, phpcs, composer-audit, semgrep, bearer, gitleaks, trivy, cloc |
| **WordPress** | wpscan, gitleaks, trivy |
| **TypeScript / React** | eslint, tsc, knip, madge, semgrep, bearer, gitleaks, trivy, cloc |
| **Node.js** | eslint, tsc, depcheck, npm-audit, semgrep, bearer, gitleaks, trivy |
| **Production URL** | lighthouse, pa11y, zap-baseline, nuclei, headers, ssllabs-scan, testssl |
| **Multi / cross-cutting** | semgrep, bearer, gitleaks, trivy, cloc |

Detailed catalog (role, options): [`docs/scanners.md`](docs/scanners.md).

---

## Scanners by execution mode

| Mode | Scanners |
|------|----------|
| **Local** (system binary) | eslint, tsc, knip, depcheck, npm-audit, madge, semgrep, bearer, gitleaks, cloc, lighthouse, pa11y, headers, ssllabs-scan, testssl |
| **Docker** (auto-pulled image) | phpstan, phpcs, composer-audit, wpscan, zap-baseline |
| **Hybrid** (`execHybrid`: local then Docker fallback) | trivy, nuclei |

`basile doctor` reports in real time what's available locally vs through Docker.

---

## Cookbook YAML

Minimal example:

```yaml
name: audit-client-x
output: ./reports/{{date}}-{{name}}
parallel: 4

targets:
  - id: api
    type: code
    path: ./apps/api
    stacks: [php, symfony]
    scanners: [phpstan, phpcs, composer-audit, semgrep, bearer]

  - id: prod
    type: url
    url: https://app.client.fr
    scanners: [lighthouse, pa11y, zap-baseline, headers, ssllabs-scan]

report:
  formats: [md, pdf]
  template: executive       # executive | technical | security
  group_by: [target, severity]
  min_severity: low
```

Full annotated cookbook: [`docs/examples/multistack-cookbook.md`](docs/examples/multistack-cookbook.md).

---

## Batched setup

Missing tools grouped by package manager (1 `brew install A B C`, 1 `npm i -g X Y Z`, parallel Docker pulls).

```bash
basile setup --stack url --yes                  # everything for URL audit
basile setup --stack php,symfony                # PHP + Symfony
basile setup --category dast --yes              # all DAST tools
basile setup --all --yes                        # entire registry
basile setup --recipe cookbook.yaml             # only what recipe needs
basile setup --all --docker-concurrency 5       # cap docker parallelism
```

Filters: `--stack` (`php`, `symfony`, `wordpress`, `typescript`, `react`, `nodejs`, `url`) | `--category` (`security`, `quality`, `performance`, `a11y`, `deps`, `secrets`, `privacy`, `sast`, `dast`, `lint`).

---

## Output

```
reports/<run>/
├── raw/*.json              # raw output per scanner
├── findings.ndjson         # normalized findings
├── meta.json               # run metadata
├── report.md               # Markdown report
└── report.pdf              # if pdf in report.formats
```

Re-render without re-scanning:

```bash
basile report --from reports/2026-05-06-audit-client-x --pdf
basile report --from reports/<run> --template technical
```

UI modes (`--ui`): `pretty` (TTY), `plain` (CI), `json` (NDJSON pipe), `quiet`.

---

## Further reading

- Scanner catalog: [`docs/scanners.md`](docs/scanners.md)
- Examples: [`docs/examples/`](docs/examples/)
- Architecture & contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Build & npm release: [`docs/internal/release.md`](docs/internal/release.md)
- RFC-001 spec: [`docs/rfc/RFC-001-audit-multi-stack.md`](docs/rfc/RFC-001-audit-multi-stack.md)
