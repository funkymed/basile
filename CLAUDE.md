# CLAUDE.md — basile

## Output Constraints
- Réponses concises, évite le mur de texte
- Pour analyses longues: scinder ou écrire dans un .md
- Questions de clarification via `AskUserQuestion`, pas en bloc

## Verification Before Action
- `git status` avant tout audit/refactor
- `pnpm typecheck && pnpm build` après refactor multi-fichiers
- Quand on corrige un bug, on le corrige (pas juste l'expliquer sauf demande)

## Honest Feedback
- Audits/évaluations: stricts et honnêtes, pas de score gonflé
- Lead avec les vérités les plus dures

## Conventions projet

- English pour code (variables, commentaires), French pour UI/i18n
- Pas de Docker local sauf scanners non iso (PHP, ZAP, wpscan)
- Branche: `feat/rfc-XXX`
- Commits conventionnels: `feat(rfc-XXX): ...`, `fix(scanner-X): ...`

## Stack

- TypeScript / Node 20+ / pnpm workspaces
- CLI: oclif
- Orchestration: listr2
- Reporting: Handlebars + Pandoc (pas d'IA)

## RFC

| ID | Titre | Statut | Branche |
|----|-------|--------|---------|
| [RFC-001](docs/rfc/RFC-001-audit-multi-stack.md) | App d'audit multi-stack à la carte | Draft | `feat/rfc-001` |

## Gantt — progression

| RFC | % | Étape courante |
|-----|---|----------------|
| RFC-001 | 5% | Bootstrap repo + rédaction RFC |

### Détail RFC-001 (MVP)

- [x] Bootstrap repo + RFC
- [ ] Mono-repo packages (core, cli, scanners)
- [ ] CLI oclif: doctor, init, list-scanners, setup
- [ ] Registre installers + détection brew/apt/docker
- [ ] Preflight pré-scan
- [ ] 3 scanners pilotes: phpstan, eslint, lighthouse
- [ ] Reporter Markdown (template executive)
- [ ] Scanners batch 2: semgrep, bearer, trivy, gitleaks, npm/composer audit
- [ ] DAST: zap-baseline, nuclei, wapiti, headers
- [ ] Reporter PDF via Pandoc
- [ ] Templates technical + security
- [ ] WordPress, tsc, knip, depcheck, pa11y, ssllabs
