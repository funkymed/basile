# Scanner catalog

25 scanners grouped by category. Source of truth: [`packages/cli/src/registry.ts`](../packages/cli/src/registry.ts).

Mode legend: **L** = local (requires system binary) — **D** = Docker (auto-pulled image) — **H** = hybrid (`execHybrid`: local, fallback to Docker).

---

## SAST — static analysis

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `phpstan` | php, symfony | D | PHP static analysis. Catches type errors, dead branches, unknown calls. |
| `phpcs` | php, symfony | D | PHP coding standards (PSR-12, Symfony, custom rulesets). |
| `eslint` | typescript, react, nodejs | L | JS/TS linter, configurable rules / plugins / presets. |
| `tsc` | typescript | L | TypeScript compiler in `--noEmit` mode: type errors. |
| `semgrep` | multi (php, ts, py, go, java, ...) | L | Pattern-based SAST (community registry + custom YAML rules). |
| `bearer` | multi | L | PII / sensitive data flow detection (GDPR, HIPAA, OWASP). |

## Quality / tech debt

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `knip` | typescript, react, nodejs | L | Unused exports, files, dependencies. |
| `madge` | typescript, javascript | L | Circular dependencies + module graph. |
| `cloc` | multi | L | Lines of code per language (project stats). |

## Dependencies (SCA) & secrets

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `composer-audit` | php | D | Composer dependency CVEs (via `composer audit`). |
| `npm-audit` | nodejs | L | npm registry CVEs. |
| `depcheck` | nodejs | L | Declared-but-unused + used-but-undeclared dependencies. |
| `trivy` | multi | H | SCA + secrets + IaC + Docker images (multi-purpose). |
| `gitleaks` | multi (git) | L | Secret scanning across git history + working tree. |

## WordPress

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `wpscan` | wordpress | D | Vulnerabilities in plugins/themes/users (WPScan CVE DB). |

## DAST — URL scanning

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `zap-baseline` | url | D | OWASP ZAP passive mode (non-intrusive baseline scan). |
| `nuclei` | url | H | Template-based scanner (CVEs, misconfigurations, exposures). |

## Recon / External Attack Surface (EASM)

See [RFC-002](rfc/RFC-002-recon-scanners.md) for the full specification.

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `subfinder` | url, domain | H | Passive subdomain enumeration (projectdiscovery, multi-source). Auto-extracts root domain (compound TLD aware: `co.uk`, `com.br`, ...). |
| `wafw00f-lite` | url | L | WAF / CDN detection via header + cookie + body signatures. 24 vendors covered (Cloudflare, AWS WAF, Akamai, Imperva, Fastly, ...). Optional `aggressive` mode. |
| `attack-surface` | url, domain | H | Composite EASM orchestrator: enum → probe alive → grade headers → detect WAF → categorize hosts (app / api / admin / dev / staging / internal). Emits `attack_surface.*` findings. |

Usage:
```bash
basile scan --recipe cookbook.yaml           # via cookbook (see examples/recon-scan.md)
basile subfinder example.com                 # shortcut: enum only
basile waf https://example.com               # shortcut: WAF only
basile recon example.com                     # shortcut: full pipeline
```

## Performance / accessibility / headers / TLS

| Scanner | Stacks | Mode | Role |
|---------|--------|------|------|
| `lighthouse` | url | L | Google Lighthouse audit: perf, a11y, SEO, best practices, PWA. |
| `pa11y` | url | L | Accessibility tests (WCAG 2.1 AA via axe-core / htmlcs). |
| `headers` | url | L | HTTP security header audit (CSP, HSTS, X-Frame-Options, etc.). |
| `ssllabs-scan` | url | L | Qualys SSL Labs grade (remote TLS configuration). |
| `testssl` | url | L | TLS/SSL audit (ciphers, versions, Heartbleed/POODLE/...). |

---

## Execution modes — detail

`exec.execHybrid()` (in `@basile/core`):

1. `which <bin>` → if found → run locally (cached for the process)
2. Otherwise → run via Docker auto-mounting the target volume

PHP / Ruby / Java rarely standard on dev machines → Docker by default. JS / brew tools → local by default.

## Adding a scanner

See [`CONTRIBUTING.md`](../CONTRIBUTING.md#adding-a-scanner).
