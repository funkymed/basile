# Changelog

All notable changes to BASILE. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [0.0.7] — 2026-05-11

Fulfills [RFC-002 — Recon scanners](docs/rfc/RFC-002-recon-scanners.md). Scanner count: 22 → 25.

### Added

- **Scanner `subfinder`** — passive subdomain enumeration via projectdiscovery, hybrid local/Docker. Auto-extracts root domain from URL or subdomain input. Output: `hosts[]`, `sources[]`, metrics.
- **Scanner `wafw00f-lite`** — Node-pure WAF / CDN detection, no Python dep. Ships 24 vendor signatures (Cloudflare, AWS WAF, Akamai, Imperva, Fastly, ...). Optional `aggressive: true` to send anomaly payloads.
- **Scanner `attack-surface`** — composite orchestrator: enum → probe alive → header grade → WAF detect → categorize hosts (app / api / admin / dev / staging / internal / infra / marketing). Emits `attack_surface.*` findings (exposed dev env, missing security header, no WAF protection, ...).
- **Target type `domain`** — new top-level target, distinct from `url`. Supports compound TLDs (`co.uk`, `com.br`, `co.jp`, `app`, `dev`, ...).
- **CLI shortcuts** — `basile subfinder <domain>`, `basile waf <url>`, `basile recon <domain>` (no cookbook required).
- **Scan flag** — `basile scan --recipe cookbook.yaml --recon` forces `attack-surface` activation.
- **Doctor checks** — reports availability of `subfinder`, `httprobe`, `jq`.
- **Reporter section** — "Attack Surface" block in HTML / PDF / Markdown reports (inventory table, global grade, WAF coverage %, risks).
- **Docs** — [`docs/examples/recon-scan.md`](docs/examples/recon-scan.md), updated [`docs/scanners.md`](docs/scanners.md) catalog with EASM category.

### Internal

- Extracted `extractRootDomain()` and `categorizeHost()` helpers to `@basile/core/utils/domain.ts`. Compound TLD list embedded, no network call.
- New `attack_surface.*` finding namespace registered in `@basile/core` types.

### Notes

- Passive only — no active port scan, no DNS brute-force, no exploitation.
- Backward compatible — additive change, no breaking modifications. Existing `url` and `code` targets behave identically.
- `~/.config/subfinder/provider-config.yaml` is respected, never modified. Add API keys (Shodan, Censys, VirusTotal, ...) for richer enumeration.

---

## [0.0.6] — prior release

(No changelog entry recorded; see git history.)
