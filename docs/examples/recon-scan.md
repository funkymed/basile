# Recon / Attack Surface scan

External Attack Surface Management (EASM) workflows: subdomain enumeration, WAF detection, and combined recon audits. Spec: [RFC-002](../rfc/RFC-002-recon-scanners.md).

Three scanners ship in v0.0.7:

- `subfinder` — passive subdomain enumeration (projectdiscovery)
- `wafw00f-lite` — WAF / CDN detection (Node, no Python dep)
- `attack-surface` — composite orchestrator (enum + probe + headers + WAF + categorize)

Plus a new target type `domain` (no scheme, distinct from `url`).

---

## Case 1 — Standalone subdomain enumeration

`cookbook.yaml`:

```yaml
name: enum-example
output: ./reports/{{date}}-{{name}}

targets:
  - id: enum
    type: domain
    domain: example.com
    scanners:
      - subfinder

report:
  formats: [json]
```

CLI shortcut:
```bash
basile subfinder example.com
basile subfinder example.com --json
basile subfinder example.com --strict        # don't auto-strip subdomain
```

If you pass a subdomain (`app.example.com`) or a full URL (`https://app.example.com`), basile extracts the root domain by default. Compound TLDs are handled: `app.example.co.uk` → `example.co.uk`, `loja.shop.com.br` → `shop.com.br`.

---

## Case 2 — URL audit + headers + WAF (no enum)

`cookbook.yaml`:

```yaml
name: url-audit
output: ./reports/{{date}}-{{name}}

targets:
  - id: prod
    type: url
    url: https://app.example.com
    scanners:
      - headers
      - wafw00f-lite
      - ssllabs-scan

report:
  formats: [md, pdf]
  template: security
```

CLI shortcut:
```bash
basile waf https://app.example.com
basile waf https://app.example.com --aggressive
```

`aggressive: true` sends anomaly payloads (SQLi/XSS probes) to trigger 403/blocked responses for sharper detection. Off by default to keep scans passive.

---

## Case 3 — Full recon composite

`cookbook.yaml`:

```yaml
name: recon-example
output: ./reports/{{date}}-{{name}}
parallel: 4

targets:
  - id: surface
    type: url
    url: https://app.example.com
    scanners:
      - attack-surface:
          options:
            enum_sources: subfinder
            include_root: true
            parallel: 10
            categorize: true

report:
  formats: [md, pdf, json]
  template: security
```

CLI shortcut:
```bash
basile recon example.com
basile recon example.com --parallel 20
basile recon example.com -o report.pdf
basile recon example.com --json | jq '.metrics'
```

---

## Case 4 — Recon + full audit combined (repo + URL)

`cookbook.yaml`:

```yaml
name: audit-client-x
output: ./reports/{{date}}-{{name}}
parallel: 4

targets:
  - id: api
    type: code
    path: ./apps/api
    stacks: [php, symfony]
    scanners:
      - phpstan
      - composer-audit
      - semgrep
      - bearer
      - gitleaks
      - trivy

  - id: prod
    type: url
    url: https://app.client.fr
    options:
      recon: true
    scanners:
      - attack-surface
      - lighthouse
      - pa11y
      - headers
      - ssllabs-scan
      - nuclei

report:
  formats: [md, pdf]
  template: security
```

`target.options.recon: true` auto-activates `attack-surface` even if a future cookbook strips the scanner from the list.

---

## Case 5 — Subfinder piped output (tooling)

Plain text, one host per line, for downstream tools (httpx, nuclei, custom scripts):

```bash
basile subfinder example.com --plain > hosts.txt
cat hosts.txt | httprobe | nuclei -t cves/
```

`--plain` skips JSON wrapping. Combine with `--strict` if input is a known subdomain you want to enum directly.

---

## Example output — `attack-surface`

Abbreviated `reports/<run>/raw/attack-surface.json`:

```json
{
  "scanner": "attack-surface",
  "version": "1.0.0",
  "target": {
    "input": "example.com",
    "root_domain": "example.com"
  },
  "metrics": {
    "duration_ms": 47000,
    "subdomains_total": 23,
    "subdomains_alive": 17,
    "grade_global": "B",
    "waf_coverage_pct": 71,
    "exposed_dev_count": 2,
    "exposed_internal_count": 1
  },
  "findings": [
    {
      "type": "exposed_dev_environment",
      "severity": "high",
      "host": "staging.example.com",
      "remediation": "Restrict via IP allowlist or basic auth"
    }
  ],
  "data": {
    "inventory": [
      {
        "host": "app.example.com",
        "url": "https://app.example.com",
        "category": "app",
        "status": 200,
        "grade": "A+",
        "waf": "Cloudflare",
        "headers_missing": []
      }
    ]
  }
}
```

Finding types emitted (namespace `attack_surface.*`):

| Type | Severity | Trigger |
|---|---|---|
| `exposed_internal_service` | 🔴 high | host matches `internal.*`, `private.*`, `k8s.*` and is alive |
| `exposed_dev_environment` | 🔴 high | host matches `dev.*`, `staging.*`, `test.*`, `qa.*` and is alive |
| `missing_security_header` | 🟡 medium | per (host, header) pair |
| `no_waf_protection` | 🔵 low | public-facing host (api/app/admin) with no WAF |
| `dev_codename_leaked` | ⚪ info | subdomain matches `*-test-*`, `*-poc-*`, `*-demo-*` |
| `weak_naming_hygiene` | ⚪ info | aggregate: >5 codenames + dev/test envs |

---

## Notes

- **Subdomain auto-extraction**: `subfinder` and `attack-surface` accept URLs, subdomains, or root domains. Root is extracted using a compound-TLD-aware utility (`extractRootDomain` in `@basile/core`). Override with `--strict` (CLI) or `options.strict: true` (cookbook).
- **Compound TLDs**: `co.uk`, `com.br`, `co.jp`, `app`, `dev`, etc. handled. List sourced from public suffix list, no network call.
- **WAF signatures**: `wafw00f-lite` ships 24 vendors by default (Cloudflare, AWS WAF, Akamai, Sucuri, Imperva, F5 BIG-IP, Fastly, Vercel, Netlify, StackPath, Wordfence, ModSecurity, Barracuda, Fortinet FortiWeb, Citrix NetScaler, Reblaze, WP Engine, Squarespace, Shopify, Sophos UTM, DenyAll, Section.io, Cloudflare Pages, AWS CloudFront). Extend via `options.signatures_db_path`.
- **Subfinder providers**: richer results require API keys in `~/.config/subfinder/provider-config.yaml` (Shodan, Censys, VirusTotal, BinaryEdge, ...). Without keys, free providers are used (crt.sh, hackertarget, AlienVault OTX, ...). basile **never modifies** user config.
- **Doctor**: `basile doctor` reports `subfinder`, `httprobe`, `jq` availability and falls back to Docker (`projectdiscovery/subfinder:latest`) when missing.
- **Passive only**: no active port scan, no DNS brute-force, no exploitation. Read-only signals. Always scan domains you own or have authorization for.

---

## When to use what

| Goal | Recipe / shortcut |
|---|---|
| List subdomains for tooling pipeline | `basile subfinder <domain> --plain` |
| Check if a single URL is behind a WAF | `basile waf <url>` |
| Map external surface + grade + WAF coverage | `basile recon <domain>` or `attack-surface` scanner |
| Full client audit (repo + recon + DAST) | cookbook Case 4 |
| CI snapshot of attack surface | cookbook Case 3, `--format json`, diff in pipeline |

---

## See also

- [`../scanners.md`](../scanners.md) — full scanner catalog
- [`../rfc/RFC-002-recon-scanners.md`](../rfc/RFC-002-recon-scanners.md) — full RFC spec
- [`url-quick-scan.md`](url-quick-scan.md) — non-recon URL audits
- [`multistack-cookbook.md`](multistack-cookbook.md) — multi-target cookbook
