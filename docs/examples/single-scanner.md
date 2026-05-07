# Running a single scanner

Use case: quickly try a specific scanner, or wire one targeted check into CI.

## On code

```bash
# Secret detection across git history
basile scan --target . --scanners gitleaks

# TS types only
basile scan --target ./apps/web --stacks typescript --scanners tsc

# PHP dependency CVEs
basile scan --target ./apps/api --stacks php --scanners composer-audit

# PII / GDPR
basile scan --target ./apps/api --scanners bearer
```

## On a URL

```bash
# Lighthouse only
basile scan --url https://example.com --scanners lighthouse

# Security headers
basile scan --url https://example.com --scanners headers

# SSL Labs grade
basile scan --url https://example.com --scanners ssllabs-scan
```

## Severity filters

```bash
basile scan --target . --scanners semgrep --min-severity high
```

## JSON output for pipe / CI

```bash
basile scan --target . --scanners gitleaks --ui json | jq '.findings[]'
```

## CI exit code

Non-zero exit when findings ≥ configured `min_severity`. Useful for failing a CI build:

```bash
basile scan --target . --scanners gitleaks,npm-audit --min-severity high
echo "exit: $?"
```

## See also

- [`../scanners.md`](../scanners.md) — pick the right scanner
- [`url-quick-scan.md`](url-quick-scan.md), [`code-php-scan.md`](code-php-scan.md), [`code-typescript-scan.md`](code-typescript-scan.md)
