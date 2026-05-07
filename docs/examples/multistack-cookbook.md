# Multi-stack audit via cookbook

Declarative mode: a YAML cookbook describing targets + scanners + output format. Reproducible, versionable, ideal for CI or recurring audits.

## Annotated full cookbook

`cookbook.yaml`:

```yaml
name: audit-client-x                         # logical run name
output: ./reports/{{date}}-{{name}}          # variables: {{date}}, {{name}}
parallel: 4                                  # max concurrent scans

targets:
  # 1. PHP/Symfony API
  - id: api
    type: code
    path: ./apps/api
    stacks: [php, symfony]
    scanners:
      - phpstan
      - phpcs
      - composer-audit
      - semgrep
      - bearer
      - gitleaks
      - trivy

  # 2. TS/React frontend
  - id: web
    type: code
    path: ./apps/web
    stacks: [typescript, react]
    scanners:
      - eslint
      - tsc
      - knip
      - madge
      - depcheck
      - npm-audit
      - semgrep
      - bearer

  # 3. Production URL
  - id: prod
    type: url
    url: https://app.client.fr
    scanners:
      - lighthouse
      - pa11y
      - zap-baseline
      - nuclei
      - headers
      - ssllabs-scan
      - testssl

  # 4. Public WordPress site
  - id: blog
    type: url
    url: https://blog.client.fr
    scanners: [wpscan, headers, ssllabs-scan]

report:
  formats: [md, pdf]                        # md | pdf | ndjson
  template: executive                       # executive | technical | security
  group_by: [target, severity]
  min_severity: low                         # info | low | medium | high | critical
```

## Workflow

```bash
# 1. Install missing tools
basile setup --recipe cookbook.yaml --yes

# 2. Run the scan
basile scan --recipe cookbook.yaml

# 3. Re-render the report without re-scanning
basile report --from reports/2026-05-07-audit-client-x --pdf
```

## Variants

### Auto-install at preflight

```bash
basile scan --recipe cookbook.yaml --auto-install
```

### Skip preflight (CI where everything is already set up)

```bash
basile scan --recipe cookbook.yaml --skip-preflight
```

### Cap Docker concurrency

```bash
basile setup --recipe cookbook.yaml --docker-concurrency 3
```

## Report templates

| Template | Audience | Content |
|----------|----------|---------|
| `executive` | C-level | Summary, scores, top risks, recommendations |
| `technical` | Devs / Leads | Detailed findings, file:line, fix suggestions |
| `security` | CISO / Audit | CVEs, OWASP mapping, severity matrix |

## See also

- [`../scanners.md`](../scanners.md) — per-scanner detail
- [`single-scanner.md`](single-scanner.md) — focused execution
- `recipes/examples/` — additional sample cookbooks
