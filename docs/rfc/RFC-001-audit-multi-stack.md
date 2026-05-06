# RFC-001 — App d'audit multi-stack à la carte

- **Statut**: Draft
- **Auteur**: Cyril Pereira
- **Date**: 2026-05-06
- **Branche**: `feat/rfc-001`

---

## 1. Contexte

Aujourd'hui les audits techniques (sécurité, qualité, perf, deps, accessibilité) sont menés manuellement, projet par projet, en assemblant ad-hoc des outils (phpstan, eslint, lighthouse, semgrep, bearer, ZAP…) puis en consolidant à la main les résultats dans un livrable Markdown ou PDF. Ce processus est long, peu reproductible, et la qualité du livrable dépend de la rigueur de l'opérateur.

L'objectif est de **transformer ce workflow manuel en CLI réutilisable**, capable de scanner n'importe quelle cible (code source ou URL) **à la carte** ou via un **cookbook YAML déclaratif**, et de **consolider la sortie sans dépendance à une API LLM** (résultats déterministes, gratuits, reproductibles).

## 2. Objectifs

- Scanner du code source: PHP/Symfony, WordPress, TypeScript/React, Node.js
- Scanner des URLs en production (perf, a11y, sécurité headers/TLS, DAST)
- Mode **ad-hoc** (`--target`, `--url`, `--scanners`) ou **cookbook** (`--recipe cookbook.yaml`)
- Consolider en **Markdown** + **PDF** (via Pandoc) sans LLM
- Hybride **local prioritaire / Docker fallback** pour les outils non iso (PHP, Ruby, Java)
- **Preflight check** avant scan: vérifier outils requis, proposer install
- Commande **`setup`**: installation interactive guidée des binaires/images Docker
- Sortie **réjouable**: même cookbook → même structure de rapport
- Coverage gaps signalés explicitement dans le rapport

## 3. Non-objectifs

- Pas d'analyse en temps réel (pas de daemon, pas de webhook)
- Pas d'orchestration distribuée multi-machine
- Pas d'IA générative pour la rédaction (templates Handlebars seuls)
- Pas de stockage centralisé (chaque run produit un dossier local)
- Pas de SaaS / UI web (CLI uniquement dans cette V1)

## 4. Stack

| Couche | Choix | Justification |
|--------|-------|--------------|
| Langage | TypeScript / Node 20+ | Écosystème scanners JS riche, async natif, packaging npx |
| Mono-repo | pnpm workspaces | Léger, parallélisme, hoisting performant |
| CLI framework | oclif | Sous-commandes structurées, plugin system pour scanners tiers |
| Orchestration | listr2 | Tâches parallèles, reprise, UI terminal soignée |
| Validation | Zod | Schémas runtime + types TS dérivés |
| Prompts interactifs | @clack/prompts | Moderne, plus joli qu'inquirer, supporte spinners |
| Templates | Handlebars | Simple, partials, helpers custom |
| PDF | Pandoc + eisvogel | Standard de fait, pas de dépendance lourde Node |
| Tests | Vitest | Rapide, ESM natif |

## 5. Architecture

### Mono-repo

```
basile/
├── packages/
│   ├── core/                # types, recipe loader, exec wrapper, installers, preflight, runner
│   ├── cli/                 # oclif: scan, report, doctor, init, setup, list-scanners
│   ├── scanners/
│   │   ├── php/             # phpstan, phpcs, phpmd, composer-audit, symfony-lint
│   │   ├── wordpress/       # wpscan
│   │   ├── js/              # eslint, tsc, knip, depcheck, npm-audit, madge
│   │   ├── web/             # lighthouse, pa11y, nuclei, wapiti, ssllabs, headers, zap-baseline
│   │   └── universal/       # semgrep, trivy, gitleaks, bearer, cloc
│   └── reporters/
│       ├── markdown/        # Handlebars
│       └── pdf/             # wrapper Pandoc
├── templates/
│   ├── executive.hbs
│   ├── technical.hbs
│   └── security.hbs
├── recipes/examples/*.yaml
└── docs/rfc/
```

### Schéma normalisé Finding

```ts
type Finding = {
  scanner: string;
  category: 'security' | 'quality' | 'performance' | 'a11y' | 'deps' | 'secrets' | 'privacy';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  target: string;             // path ou URL
  file?: string; line?: number;
  rule?: string; cwe?: string; owasp?: string;
  message: string;
  raw: unknown;
};
```

Chaque scanner = adapter `(target, opts) => Promise<Finding[]>`.

### Exécution hybride local|docker

Helper `core/src/exec.ts`:

```ts
const cmd = which('phpstan')
  ? ['phpstan', 'analyse', target, '--error-format=json']
  : ['docker', 'run', '--rm', '-v', `${target}:/app`,
     'ghcr.io/phpstan/phpstan', 'analyse', '/app', '--error-format=json'];
```

Détection au démarrage (cache résultats `which` sur la durée du process).

## 6. Scanners ciblés (DAST + Bearer inclus)

| Catégorie | Outil | Type | Mode |
|-----------|-------|------|------|
| SAST PHP | phpstan, phpcs, phpmd | static | docker |
| SAST JS/TS | eslint, tsc, knip, depcheck, madge | static | local |
| SAST multi | semgrep | static | local |
| SAST privacy/PII | **bearer** | static | local |
| SCA | composer audit, npm audit, trivy fs | deps | mixte |
| Secrets | gitleaks, trivy secret | static | local |
| WordPress | wpscan | mixed | docker |
| **DAST URL** | **OWASP ZAP (zap-baseline.py)** | dynamic | docker |
| DAST léger | nuclei, wapiti | dynamic | mixte |
| Perf/A11y | lighthouse, pa11y | dynamic | local |
| Headers/TLS | curl, ssllabs-scan, testssl.sh | dynamic | local |
| Stats | cloc | meta | local |

## 7. Cookbook YAML

```yaml
name: audit-client-x
output: ./reports/{{date}}-client-x
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
    scanners: [lighthouse, pa11y, zap-baseline, nuclei, headers, ssllabs]
report:
  formats: [md, pdf]
  template: executive
  group_by: [target, severity]
```

Validation Zod stricte. Fail-fast si stack/scanner inconnu.

## 8. Commandes CLI

```
audit init                            # scaffold cookbook.yaml
audit doctor                          # état binaires + Docker + images
audit setup                           # interactif: install outils manquants
audit setup --recipe cookbook.yaml    # restreint à la recette
audit setup --scanners phpstan,zap    # ciblé
audit setup --yes --non-interactive   # CI
audit scan --recipe cookbook.yaml
audit scan --target ./src --stacks symfony --scanners phpstan,bearer
audit scan --url https://x.fr --scanners zap-baseline,lighthouse
audit scan --recipe cookbook.yaml --auto-install
audit scan --recipe cookbook.yaml --skip-preflight
audit report --from reports/<run>
audit list-scanners
```

### 8.1 Preflight (avant chaque `scan`)

1. Résolution: scanners requis depuis recipe/CLI
2. `installers.ts::verify()` pour chaque outil (binaire local OU image Docker)
3. Si manquants:
   - **Interactif TTY**: tableau récap + prompt `[I]nstall / [S]kip / [A]bort`
   - **`--auto-install`**: installe sans demander
   - **CI / non-TTY sans flag**: exit code 2 + commande à copier-coller
   - **`--skip-preflight`**: bypass total
4. "Skip ces scanners" → retiré du run, warning consigné dans `coverage_gaps` du rapport
5. Vérif version min/max requise (`phpstan >= 1.10`)

Module `core/src/preflight.ts` — partage UI clack avec `setup`.

### 8.2 `setup` — installateur

Détecte OS (macOS/Linux), package manager (brew/apt/dnf/pacman), Docker, npm. Pour chaque outil manquant:

1. Affiche outil + raison + commande exacte
2. Confirmation utilisateur
3. Exécution + vérification (`which` + `--version`)
4. Pour Docker: `docker pull` avec progress
5. Rapport final: ✓ installés / ✗ échecs / ⊘ skip

Registre `installers.ts`:

```ts
type InstallRecipe = {
  scanner: string;
  modes: {
    local?: { darwin?: string; linux?: { apt?: string; dnf?: string }; npm?: string };
    docker?: { image: string; tag: string };
  };
  verify: { cmd: string; flag: string };
};
```

Garde-fous: confirmation avant tout `sudo` et tout download > 100MB.

## 9. Workflow de consolidation (sans IA)

1. Agrégation des Findings → groupements par target/category/severity
2. Calculs: counts, top rules, score pondéré (critical=10, high=5, medium=2, low=1, info=0)
3. Render Handlebars: `{{#each targets}} {{> section}} {{/each}}`
4. Pandoc: `pandoc report.md -o report.pdf --template=eisvogel --toc`

Helpers Handlebars custom: `severityBadge`, `groupBy`, `truncate`, `cweLink`, `coverageBar`.

Sortie:
```
reports/<run>/
├── raw/<scanner>.json          # sortie brute par scanner
├── findings.ndjson             # agrégé normalisé
├── report.md
├── report.pdf
└── meta.json                   # recipe + versions outils + timestamps
```

## 10. Outils requis

### Local (brew + npm)

```bash
brew install node pnpm pandoc semgrep trivy gitleaks nuclei cloc testssl
brew install bearer/tap/bearer ssllabs-scan
brew install --cask basictex docker
npm i -g knip depcheck madge lighthouse pa11y @lhci/cli
```

### Docker (PHP, WordPress, DAST)

```bash
docker pull ghcr.io/phpstan/phpstan
docker pull cytopia/phpcs cytopia/phpmd composer:2
docker pull wpscanteam/wpscan
docker pull ghcr.io/zaproxy/zaproxy:stable
docker pull cyberwatch/wapiti
```

`audit setup` automatise tout cela.

## 11. Alternatives écartées

| Alternative | Raison du rejet |
|-------------|----------------|
| Python (Click/Typer) | Écosystème scanners JS plus large; CLI déjà majoritairement TS chez l'auteur |
| Go (Cobra) | Verbeux pour orchestration async, perte de rapidité de prototypage |
| Tout-Docker (chaque scanner via image) | Lenteur démarrage, friction CI, coût bande passante |
| Tout-local (zéro Docker) | Impossible: PHP/Ruby/Java rarement iso sur machine dev |
| LLM obligatoire (Ollama) | Non déterministe, requiert machine costaude, ralentit feedback |
| API Claude/OpenAI | Coût, dépendance externe, problématique de confidentialité |
| SaaS dédié (Snyk, SonarCloud) | Pas de contrôle, coût récurrent, adaptable difficilement aux cookbooks |

## 12. Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Versions outils incompatibles | Faux négatifs | `verify` vérifie version min, alerte dans doctor |
| Docker absent en CI | Scanners PHP/DAST KO | Preflight remonte erreur claire + skip option |
| Volume montage Docker (chemins relatifs) | Bugs cross-OS | `exec.ts` résout en absolu via `path.resolve` |
| Sortie scanners hétérogène | Mapping Finding fragile | Tests fixtures par scanner avec snapshots |
| Pandoc absent | PDF non généré | Fallback: Markdown seul + warning |
| Faux positifs ZAP/Bearer | Bruit dans rapport | Filtres dans recipe (`exclude_rules`, `min_severity`) |
| Performance scan URL (rate limit) | Bannissement | `parallel` configurable, jitter entre requêtes |

## 13. Plan d'implémentation (MVP)

0. **Bootstrap** repo `~/Sites/basile` + RFC-001 + entrée Gantt CLAUDE.md (`feat/rfc-001`)
1. Mono-repo packages: `core` (types, recipe loader Zod, `exec.ts` local|docker)
2. CLI oclif: `doctor`, `init`, `list-scanners`, `setup` (`@clack/prompts`)
3. `installers.ts` pour 5 outils pilotes + détection brew/apt/docker
4. `preflight.ts` — vérif scanners requis + UI clack partagée
5. Runner listr2 + 3 scanners pilotes: **phpstan** (docker), **eslint** (local), **lighthouse** (local)
6. Reporter Markdown + template `executive`
7. Scanners batch 2: semgrep, bearer, trivy, gitleaks, npm/composer audit
8. DAST: zap-baseline, nuclei, wapiti, headers
9. Reporter PDF via Pandoc
10. Templates `technical` + `security`
11. WordPress (wpscan), tsc, knip, depcheck, pa11y, ssllabs

## 14. Vérification end-to-end

- `pnpm install && pnpm build` → typecheck OK
- `audit doctor` → liste binaires + Docker + images détectés/manquants
- `audit setup --recipe cookbook.yaml` → installe ce qui manque ; `doctor` repasse en ✓
- `audit scan --recipe cookbook.yaml` env vide → preflight bloque + propose install
- `audit scan --recipe cookbook.yaml --auto-install` → installe + scan en un flux
- `audit init` → cookbook example
- Fixture e2e: petit projet Symfony + petit projet React + URL publique stable
- Tests Vitest: normalizer, recipe loader, runner mocké, installers (mock OS)

## 15. Décisions ouvertes

- Nom de la commande binaire: `audit` ou `basile` ? (default proposé: `basile`, alias `audit`)
- Format des fichiers raw: JSON par scanner ou NDJSON unique ? (proposé: les deux)
- Stratégie de cache `which`: par run uniquement, ou cache disque inter-run ?

À trancher en début d'implémentation.
