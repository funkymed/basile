/**
 * Domain utilities for recon scanners (RFC-002).
 *
 * Extracts the registrable root domain from arbitrary input (URL, subdomain,
 * bare host) using a conservative heuristic with a curated list of compound
 * TLDs. This avoids pulling the full Public Suffix List into the bundle
 * (300KB+) at the cost of missing exotic TLDs — acceptable trade-off for
 * passive recon.
 */

/**
 * Compound TLDs requiring three labels to identify the registrable domain.
 * Extend conservatively; an over-broad list strips legitimate subdomains.
 */
const COMPOUND_TLDS: ReadonlySet<string> = new Set([
  // United Kingdom
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk', 'plc.uk', 'ltd.uk',
  // Japan
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  // Brazil
  'com.br', 'net.br', 'org.br', 'gov.br',
  // China
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  // Hong Kong
  'com.hk', 'net.hk', 'org.hk',
  // Mexico, Singapore, Turkey, India, South Africa, New Zealand, Korea
  'com.mx', 'com.sg', 'com.tr', 'co.in', 'co.za', 'co.nz', 'co.kr',
]);

export type DomainExtractionResult = {
  /** The registrable root domain (e.g. "example.com"). */
  root: string;
  /** Whether the input was a subdomain that got stripped. */
  wasSubdomain: boolean;
  /** The normalized input (lower-cased, scheme/path stripped). */
  normalized: string;
};

/**
 * Normalize raw user input to a bare hostname.
 * Strips scheme, path, port, and lowercases.
 */
export function normalizeHostInput(raw: string): string {
  let s = raw.trim();
  // Strip scheme
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  // Strip path + query + fragment
  s = s.split(/[/?#]/, 1)[0] ?? s;
  // Strip port
  s = s.split(':', 1)[0] ?? s;
  return s.toLowerCase();
}

/**
 * Extract the registrable root domain from arbitrary input.
 *
 * @example
 *   extractRootDomain("https://api.example.com")        // → { root: "example.com",        wasSubdomain: true,  normalized: "api.example.com" }
 *   extractRootDomain("example.com")                    // → { root: "example.com",        wasSubdomain: false, normalized: "example.com" }
 *   extractRootDomain("foo.example.co.uk")              // → { root: "example.co.uk",      wasSubdomain: true,  normalized: "foo.example.co.uk" }
 *   extractRootDomain("https://app.example.com:443/x")  // → { root: "example.com",        wasSubdomain: true,  normalized: "app.example.com" }
 */
export function extractRootDomain(input: string): DomainExtractionResult {
  const normalized = normalizeHostInput(input);
  const labels = normalized.split('.').filter((l) => l.length > 0);

  if (labels.length < 2) {
    throw new Error(`Invalid domain: "${input}" (expected at least two labels)`);
  }

  // Check compound TLD (last two labels) — promotes to three labels if match
  const lastTwo = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  const isCompound = COMPOUND_TLDS.has(lastTwo);

  const rootLabelsCount = isCompound ? 3 : 2;
  const rootLabels = labels.slice(-rootLabelsCount);

  if (rootLabels.length < rootLabelsCount) {
    // Input like "co.uk" alone — invalid registrable domain
    throw new Error(`Invalid domain: "${input}" is not a registrable domain`);
  }

  const root = rootLabels.join('.');
  return {
    root,
    wasSubdomain: normalized !== root,
    normalized,
  };
}

/**
 * Categorize a hostname into a coarse purpose (used by attack-surface scanner).
 *
 * Heuristic — patterns are matched in priority order; first match wins.
 */
export type HostCategory =
  | 'app'
  | 'api'
  | 'admin'
  | 'docs'
  | 'marketing'
  | 'dev_staging'
  | 'internal'
  | 'infra'
  | 'unknown';

export function categorizeHost(host: string, rootDomain: string): HostCategory {
  const h = host.toLowerCase();
  // Root domain itself = marketing/landing (www stripped)
  if (h === rootDomain || h === `www.${rootDomain}`) return 'marketing';

  const subdomain = h.endsWith(`.${rootDomain}`)
    ? h.slice(0, h.length - rootDomain.length - 1)
    : h;
  const firstLabel = subdomain.split('.')[0];

  // Priority order: internal/dev signals BEFORE app/api so internal-api ranks correctly
  if (/^(internal|private|intranet|k8s|kube|argocd?|grafana|prometheus|jenkins|sourcegraph|artifactory|nexus|gitlab|ghe|jira|sentry)([-.]|$)/.test(subdomain)) {
    return 'internal';
  }
  if (/^(dev|develop|development|staging|stage|stg|preprod|pre-prod|test|qa|sandbox|uat|beta|alpha|preview)([-.]|$)/.test(subdomain)) {
    return 'dev_staging';
  }
  if (/^(admin|console|portal|manage|dashboard|root)([-.]|$)/.test(subdomain)) {
    return 'admin';
  }
  if (/^(api|apis|apidocs?|graphql|grpc|gateway|edge)([-.]|$)/.test(subdomain)) {
    return 'api';
  }
  if (/^(app|application|my|account|client)([-.]|$)/.test(subdomain)) {
    return 'app';
  }
  if (/^(docs?|help|support|kb|knowledge|wiki|learn|tutorial|guide)([-.]|$)/.test(subdomain)) {
    return 'docs';
  }
  if (/^(www|get|hello|about|home|blog|news|press|company|landing|marketing|fr|en|de|es|jp|it|pt|cn|kr)([-.]|$)/.test(subdomain)) {
    return 'marketing';
  }
  if (/^(cdn|static|assets?|media|storage|s3|files|images?|img|content|public|download)([-.]|$)/.test(subdomain)) {
    return 'infra';
  }
  if (/^(mail|smtp|imap|pop|email|mx|ns\d?|dns|hostmaster|webmaster)([-.]|$)/.test(subdomain)) {
    return 'infra';
  }
  return 'unknown';
}
