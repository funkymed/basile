import { exec, type Finding, type RecipeTarget, which } from '@basile/core';
import type { Scanner } from '@basile/runner';
import { WAF_SIGNATURES, type WafSignature } from './signatures.js';

const HEAD_TIMEOUT_MS = 10_000;
const BODY_TIMEOUT_MS = 8_000;
const BODY_MAX_BYTES = 8192;

/**
 * Anomaly payload appended to the URL when aggressive mode is enabled. Designed
 * to trigger generic WAF rules (SQLi-like + XSS-like fragments). Severity is
 * benign — pattern is broken syntactically and short-circuited by any modern
 * web stack.
 */
const AGGRESSIVE_PROBE = `/?id=1'+OR+'1'='1&xss=<script>alert(1)</script>`;

export const wafw00fLiteScanner: Scanner = {
  name: 'wafw00f-lite',
  category: 'security',
  profile: 'security',
  supports: (t: RecipeTarget): boolean => t.type === 'url',

  async run(target: RecipeTarget): Promise<Finding[]> {
    if (target.type !== 'url') return [];
    if (!which('curl')) {
      throw new Error('Binary "curl" not found.');
    }

    const corpus = await fetchCorpus(target.url, false);
    let detections = matchSignatures(corpus.text);

    // Aggressive probe: if first pass detected nothing, try anomaly payload
    // to coax WAFs into emitting a 403 page with their own branding.
    if (detections.length === 0) {
      const aggressiveCorpus = await fetchCorpus(target.url, true);
      detections = matchSignatures(corpus.text + '\n' + aggressiveCorpus.text);
    }

    if (detections.length === 0) {
      return [
        {
          scanner: 'wafw00f-lite',
          category: 'security',
          severity: 'low',
          target: target.id,
          rule: 'attack_surface.no_waf_detected',
          message: `No WAF/CDN signature matched for ${target.url}`,
          raw: { url: target.url, detected: false },
        },
      ];
    }

    return [
      {
        scanner: 'wafw00f-lite',
        category: 'security',
        severity: 'info',
        target: target.id,
        rule: 'attack_surface.waf_detected',
        message: `WAF/CDN detected: ${detections.map((d) => d.name).join(', ')}`,
        raw: {
          url: target.url,
          detected: true,
          wafs: detections.map((d) => d.name),
          evidence: detections.map((d) => ({ name: d.name, matched: d.matched })),
        },
      },
    ];
  },
};

type DetectionResult = { name: string; matched: string[] };

/**
 * Match the corpus against the signature database. Returns one entry per WAF
 * detected with the list of matched patterns for evidence.
 */
export function matchSignatures(
  corpus: string,
  signatures: ReadonlyArray<WafSignature> = WAF_SIGNATURES,
): DetectionResult[] {
  const lower = corpus.toLowerCase();
  const results: DetectionResult[] = [];

  for (const sig of signatures) {
    const matched: string[] = [];
    for (const pattern of sig.patterns) {
      // Multiline regex anchors at line boundaries — required because curl
      // emits one header per line and our concatenation preserves line breaks.
      try {
        const rx = new RegExp(pattern, 'mi');
        if (rx.test(lower)) matched.push(pattern);
      } catch {
        // Skip malformed pattern (should never happen with bundled signatures).
      }
    }
    if (matched.length > 0) results.push({ name: sig.name, matched });
  }

  return results;
}

/**
 * Fetch headers (HEAD) and optionally a small body fragment, returning the
 * concatenated text used for signature matching.
 */
async function fetchCorpus(url: string, aggressive: boolean): Promise<{ text: string }> {
  const probeUrl = aggressive ? `${url}${AGGRESSIVE_PROBE}` : url;

  // HEAD request (follow redirects, ignore TLS errors for self-signed dev envs)
  const head = await exec(
    [
      'curl',
      '--silent',
      '--insecure',
      '--max-time',
      String(Math.ceil(HEAD_TIMEOUT_MS / 1000)),
      '--user-agent',
      'basile-recon/1.0',
      '-I',
      '-L',
      probeUrl,
    ],
    { timeoutMs: HEAD_TIMEOUT_MS, okExitCodes: [0, 22, 28, 56] },
  );

  // Body fragment (lightweight GET, capped)
  const body = await exec(
    [
      'curl',
      '--silent',
      '--insecure',
      '--max-time',
      String(Math.ceil(BODY_TIMEOUT_MS / 1000)),
      '--user-agent',
      'basile-recon/1.0',
      '-L',
      '--range',
      `0-${BODY_MAX_BYTES - 1}`,
      probeUrl,
    ],
    { timeoutMs: BODY_TIMEOUT_MS, okExitCodes: [0, 22, 28, 56] },
  );

  return { text: `${head.stdout}\n${body.stdout.slice(0, BODY_MAX_BYTES)}` };
}
