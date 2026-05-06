# basile

CLI d'audit multi-stack à la carte. Scanne du code source (PHP/Symfony, WordPress, TypeScript/React/Node) ou des URLs en production. Consolide les résultats en Markdown/PDF sans appel LLM.

## État

En cours de bootstrap — voir [`docs/rfc/RFC-001-audit-multi-stack.md`](docs/rfc/RFC-001-audit-multi-stack.md).

## Stack

- TypeScript / Node 20+ / pnpm workspaces
- CLI: oclif
- Orchestration: listr2
- Reporting: Handlebars → Pandoc
- Scanners: hybride local (brew/npm) + Docker fallback

## Workflow

```bash
pnpm install
pnpm build
audit init                     # scaffold cookbook.yaml
audit doctor                   # état des outils
audit setup --recipe cookbook.yaml
audit scan --recipe cookbook.yaml
audit report --from reports/<run>
```
