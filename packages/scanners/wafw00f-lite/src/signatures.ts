/**
 * WAF/CDN signature database. Each entry lists regex patterns matched against
 * the lower-cased concatenation of response headers + cookies + body fragment.
 *
 * Conservative scoring: a single match yields detection, but multi-match
 * provides higher confidence — surfaced via `evidence` in the scanner output.
 */
export type WafSignature = {
  /** Display name (e.g. "Cloudflare"). */
  name: string;
  /** Regex patterns. First match wins for detection; all matches reported as evidence. */
  patterns: string[];
};

export const WAF_SIGNATURES: ReadonlyArray<WafSignature> = [
  {
    name: 'Cloudflare',
    patterns: [
      '^cf-ray:',
      '^cf-cache-status:',
      'server:.*cloudflare',
      'set-cookie:.*__cfduid',
      'set-cookie:.*__cf_bm',
    ],
  },
  { name: 'Cloudflare Pages', patterns: ['^cf-pages:'] },
  { name: 'AWS CloudFront', patterns: ['^x-amz-cf-id:', 'via:.*cloudfront'] },
  { name: 'AWS WAF', patterns: ['^x-amzn-requestid:', '^x-amz-apigw-id:'] },
  { name: 'Akamai', patterns: ['^x-akamai-', '^akamai-', 'server:.*akamaighost'] },
  { name: 'Sucuri', patterns: ['^x-sucuri-', 'server:.*sucuri'] },
  {
    name: 'Imperva Incapsula',
    patterns: [
      '^x-iinfo:',
      '^x-cdn:.*incapsula',
      'set-cookie:.*incap_ses',
      'set-cookie:.*visid_incap',
    ],
  },
  {
    name: 'F5 BIG-IP',
    patterns: ['^x-cnection:', 'set-cookie:.*bigipserver', 'set-cookie:.*ts[0-9a-f]'],
  },
  {
    name: 'Fastly',
    patterns: ['^fastly-debug-', '^x-served-by:.*cache-', '^x-cache:.*hit.*fastly'],
  },
  { name: 'Vercel', patterns: ['server:.*vercel', '^x-vercel-'] },
  { name: 'Netlify', patterns: ['server:.*netlify', '^x-nf-request-id:'] },
  { name: 'Section.io', patterns: ['^x-section-io-'] },
  { name: 'StackPath', patterns: ['^x-sp-', 'server:.*stackpath'] },
  { name: 'Wordfence', patterns: ['^x-wordfence-'] },
  { name: 'ModSecurity', patterns: ['server:.*mod_security', '^x-modsecurity-'] },
  {
    name: 'Barracuda',
    patterns: ['^x-bnimid:', 'set-cookie:.*barra_counter_session'],
  },
  { name: 'Sophos UTM', patterns: ['set-cookie:.*astra-ws'] },
  { name: 'DenyAll', patterns: ['set-cookie:.*sessioncookie='] },
  { name: 'Fortinet FortiWeb', patterns: ['set-cookie:.*fortiwafsid'] },
  {
    name: 'Citrix NetScaler',
    patterns: ['^via:.*ns-cache', 'set-cookie:.*nsc_'],
  },
  { name: 'Reblaze', patterns: ['set-cookie:.*rbzid', 'server:.*reblaze'] },
  { name: 'WP Engine', patterns: ['server:.*wpengine', '^x-cacheable:'] },
  { name: 'Squarespace', patterns: ['server:.*squarespace'] },
  { name: 'Shopify', patterns: ['^x-shopid:', '^x-shopify-stage:'] },
];
