# PHP / Symfony directory scan

Ad-hoc audit of a PHP or Symfony project. PHPStan + PHPCS through Docker, the rest local.

## Case 1 — Minimal PHP quality audit

```bash
basile scan --target ./apps/api --stacks php --scanners phpstan,phpcs
```

## Case 2 — Full Symfony audit

```bash
basile scan --target ./apps/api \
  --stacks php,symfony \
  --scanners phpstan,phpcs,composer-audit,semgrep,bearer,gitleaks,trivy
```

Covers: types (phpstan), style (phpcs), dependency CVEs (composer-audit + trivy), patterns (semgrep), PII / GDPR (bearer), secrets (gitleaks).

## Case 3 — Security only

```bash
basile scan --target ./apps/api \
  --stacks php \
  --scanners composer-audit,semgrep,bearer,gitleaks,trivy
```

## Case 4 — Stats / tech debt

```bash
basile scan --target ./apps/api --stacks php --scanners cloc,phpstan
```

## Prerequisites

```bash
basile setup --stack php,symfony --yes
```

Installs:
- Docker images: `phpstan/phpstan`, `jakzal/phpqa` (phpcs), `composer/composer`
- Local (brew/npm/go): `semgrep`, `bearer`, `gitleaks`, `trivy`, `cloc`

## Tip — preflight + scan in one command

```bash
basile scan --target ./apps/api \
  --stacks php,symfony \
  --scanners phpstan,phpcs,composer-audit,bearer \
  --auto-install
```

## See also

- Multi-stack cookbook: [`multistack-cookbook.md`](multistack-cookbook.md)
- Scanner catalog: [`../scanners.md`](../scanners.md)
