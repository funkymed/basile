# Quick URL scan

One-shot audit of a production URL without a cookbook. Targets perf, a11y, headers, TLS, passive vulns.

## Case 1 — Perf + a11y only

```bash
basile scan --url https://example.com --scanners lighthouse,pa11y
```

Outputs: `reports/<run>/raw/{lighthouse,pa11y}.json`, `findings.ndjson`, `report.md`.

## Case 2 — Network security audit (headers + TLS)

```bash
basile scan --url https://example.com --scanners headers,ssllabs-scan,testssl
```

100% local, no Docker required.

## Case 3 — Passive DAST (OWASP)

```bash
basile scan --url https://example.com --scanners zap-baseline,nuclei
```

Docker required for `zap-baseline`. `nuclei` is hybrid (local then Docker fallback).

## Case 4 — Full URL audit (recommended)

```bash
basile scan --url https://example.com \
  --scanners lighthouse,pa11y,headers,ssllabs-scan,testssl,zap-baseline,nuclei
```

Tooling setup:
```bash
basile setup --stack url --yes
```

## PDF + executive template

```bash
basile scan --url https://example.com \
  --scanners lighthouse,pa11y,headers \
  --format md,pdf \
  --template executive
```

## Prerequisites

- `basile doctor` to see what's missing
- `lighthouse`, `pa11y`, `testssl`, `ssllabs-scan` → `npm i -g` or `brew`
- `zap-baseline` → Docker
- `nuclei` → Go binary or Docker

See [`docs/scanners.md`](../scanners.md) for details.
