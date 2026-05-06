# BASILE

CLI d'audit multi-stack à la carte. Scanne du code source (PHP/Symfony, WordPress, TypeScript/React/Node) ou des URLs en production. Consolide les résultats en Markdown/PDF **sans appel LLM** — déterministe, reproductible, gratuit.

> Voir [`docs/rfc/RFC-001-audit-multi-stack.md`](docs/rfc/RFC-001-audit-multi-stack.md) pour la spec complète.

---

## Installation

### Via tarball npx (recommandé pour tester)

```bash
# Build le tarball self-contained (5.4 MB)
pnpm pack:cli

# Lancer sans install
npx --package=file:./basile-0.0.1.tgz basile doctor

# Ou install global
npm i -g ./basile-0.0.1.tgz
basile doctor
```

### Mode dev (mono-repo)

```bash
pnpm install
pnpm -r build
node packages/cli/dist/bin/run.js doctor
```

---

## Commandes

| Commande | Rôle |
|----------|------|
| `basile doctor` | État de l'environnement (Node, Docker, package managers) + statut de tous les scanners |
| `basile list-scanners` | Liste les scanners connus, groupés par catégorie |
| `basile init` | Génère un `cookbook.yaml` de démarrage |
| `basile setup` | Installe les outils manquants (batché par PM, docker en parallèle) |
| `basile scan` | Lance un scan (recipe ou ad-hoc) |
| `basile report` | Reconsolide un run précédent en MD/PDF sans relancer les scanners |

### Setup batché — install rapide

Tous les outils manquants sont groupés par package manager (1 commande `brew install A B C`, 1 commande `npm i -g X Y Z`, docker pulls en parallèle).

```bash
# Tout pour audit URL
basile setup --stack url --yes

# PHP + Symfony
basile setup --stack php,symfony

# Tous les outils DAST
basile setup --category dast --yes

# Tous les scanners du registre
basile setup --all --yes

# Juste ce qu'une recipe demande
basile setup --recipe cookbook.yaml

# Limite concurrence docker
basile setup --all --docker-concurrency 5
```

**Filtres disponibles:**
- `--stack` — `php`, `symfony`, `wordpress`, `typescript`, `react`, `nodejs`, `url`
- `--category` — `security`, `quality`, `performance`, `a11y`, `deps`, `secrets`, `privacy`, `sast`, `dast`, `lint`

### Scan

Mode recipe (déclaratif):

```bash
basile scan --recipe cookbook.yaml
basile scan --recipe cookbook.yaml --auto-install      # installe outils manquants en preflight
basile scan --recipe cookbook.yaml --skip-preflight    # bypass check
```

Mode ad-hoc:

```bash
basile scan --target ./apps/api --stacks php,symfony --scanners phpstan,bearer
basile scan --url https://example.com --scanners lighthouse,headers,zap-baseline
```

Sortie: `reports/<run>/raw/*.json`, `findings.ndjson`, `report.md`, `meta.json`, et `report.pdf` si `pdf` dans `report.formats`.

UI modes (`--ui`):
- `pretty` (défaut TTY) — listr2 + animations + couleurs
- `plain` — logs séquentiels, pas d'ANSI (CI verbose)
- `json` — NDJSON pour pipe vers autres outils
- `quiet` — erreurs seules

### Report

Reconsolide un run sans relancer les scanners:

```bash
basile report --from reports/2026-05-06-audit-client-x
basile report --from reports/<run> --template technical --pdf
```

---

## Cookbook YAML

Exemple `recipes/examples/full-audit.yaml`:

```yaml
name: audit-client-x
output: ./reports/{{date}}-{{name}}
parallel: 4

targets:
  - id: api
    type: code
    path: ./apps/api
    stacks: [php, symfony]
    scanners: [phpstan, phpcs, composer-audit, semgrep, bearer, gitleaks, trivy]

  - id: web
    type: code
    path: ./apps/web
    stacks: [typescript, react]
    scanners: [eslint, tsc, knip, depcheck, npm-audit, semgrep, bearer]

  - id: prod
    type: url
    url: https://app.client.fr
    scanners: [lighthouse, pa11y, zap-baseline, nuclei, headers, ssllabs-scan]

report:
  formats: [md, pdf]
  template: executive    # ou technical, security
  group_by: [target, severity]
  min_severity: low
```

---

## Scanners couverts (24)

| Catégorie | Outil | Mode |
|-----------|-------|------|
| **SAST PHP** | phpstan, phpcs, phpmd | docker |
| **SAST JS/TS** | eslint, tsc, knip, depcheck, madge | local |
| **SAST multi** | semgrep | local |
| **SAST privacy** | bearer | local |
| **SCA** | composer-audit, npm-audit, trivy | mixte |
| **Secrets** | gitleaks, trivy | local |
| **WordPress** | wpscan | docker |
| **DAST URL** | OWASP ZAP (zap-baseline), nuclei, wapiti | docker / mixte |
| **Perf / A11y** | lighthouse, pa11y | local |
| **Headers / TLS** | curl headers, ssllabs-scan, testssl | local |
| **Stats** | cloc | local |

`basile doctor` affiche en temps réel ce qui est installé localement vs disponible via Docker.

---

## Architecture

Mono-repo pnpm:

```
packages/
├── core/                  # types Finding, Recipe, Zod, exec wrapper, installers, preflight, theme
├── cli/                   # oclif: doctor, init, list-scanners, setup, scan, report
├── runner/                # listr2 orchestrator + Scanner interface + ScannerRegistry
├── scanners/
│   ├── eslint/            # @basile/scanner-eslint
│   ├── lighthouse/        # @basile/scanner-lighthouse
│   └── phpstan/           # @basile/scanner-phpstan
└── reporters/
    ├── markdown/          # Handlebars + helpers + writeReport (md + ndjson + meta.json)
    └── pdf/               # wrapper Pandoc

templates/                 # executive.hbs, technical.hbs, security.hbs (copiés dans reporter-markdown)
recipes/examples/          # cookbooks types
docs/rfc/                  # RFC-001
scripts/pack.mjs           # bundle CLI self-contained pour npx
```

### Scanner = adapter

Chaque scanner implémente:

```ts
interface Scanner {
  readonly name: string;
  readonly category: Category;
  readonly supports: (target: RecipeTarget) => boolean;
  run(target: RecipeTarget, opts: ScanOptions): Promise<Finding[]>;
}
```

Découverte: `packages/cli/src/registry.ts` enregistre les scanners disponibles. Ajouter un scanner = créer un package `@basile/scanner-<name>` + l'ajouter au registry.

### Hybride local / Docker

`exec.execHybrid()` détecte le binaire local via `which`, sinon fallback Docker auto avec montage de volume. Cache `which` sur la durée du process.

PHP / Ruby / Java rarement iso sur machine dev → Docker par défaut. JS / brew tools → local.

---

## Stack

- TypeScript / Node 20+ / pnpm workspaces
- CLI: oclif + @clack/prompts + boxen + figlet + gradient-string + cli-table3 + picocolors
- Orchestration: listr2 (renderers default / verbose / silent)
- Validation: Zod
- Reporting: Handlebars + Pandoc (eisvogel)
- Tests: Vitest

---

## Conventions

- English pour code (variables, comments), French pour UI/CLI strings
- Pas de Docker local sauf scanners non iso (PHP, ZAP, wpscan, wapiti)
- Branche: `feat/rfc-XXX`
- Commits: `feat(rfc-XXX): ...`, `fix(scanner-X): ...`

---

## Workflow recommandé

```bash
# 1. Init
basile init                                  # génère cookbook.yaml

# 2. Setup outils
basile setup --recipe cookbook.yaml          # installe juste ce qu'il faut

# 3. Scan
basile scan --recipe cookbook.yaml           # preflight + scan + report

# 4. Reconsolider plus tard
basile report --from reports/<run> --pdf
```
