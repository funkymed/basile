import { describe, it, expect } from 'vitest';
import { matchSignatures } from './index.js';

describe('matchSignatures', () => {
  it('detects Cloudflare via cf-ray header', () => {
    const corpus = 'HTTP/2 200\nServer: cloudflare\nCF-RAY: 12abcd-CDG\n';
    const r = matchSignatures(corpus);
    expect(r.find((d) => d.name === 'Cloudflare')).toBeDefined();
  });

  it('detects Cloudflare cookie', () => {
    const corpus = 'HTTP/2 200\nSet-Cookie: __cf_bm=abc; path=/\n';
    expect(matchSignatures(corpus).map((d) => d.name)).toContain('Cloudflare');
  });

  it('detects AWS CloudFront via via header', () => {
    const corpus = 'HTTP/2 200\nVia: 1.1 abcd1234.cloudfront.net (CloudFront)\nX-Amz-Cf-Id: xyz\n';
    expect(matchSignatures(corpus).map((d) => d.name)).toContain('AWS CloudFront');
  });

  it('detects Vercel', () => {
    const corpus = 'HTTP/2 200\nServer: Vercel\nX-Vercel-Id: abc\n';
    expect(matchSignatures(corpus).map((d) => d.name)).toContain('Vercel');
  });

  it('detects Akamai', () => {
    const corpus = 'HTTP/2 200\nServer: AkamaiGHost\n';
    expect(matchSignatures(corpus).map((d) => d.name)).toContain('Akamai');
  });

  it('detects Imperva Incapsula via cookie', () => {
    const corpus = 'HTTP/2 200\nSet-Cookie: visid_incap_123=abc; path=/\n';
    expect(matchSignatures(corpus).map((d) => d.name)).toContain('Imperva Incapsula');
  });

  it('returns empty for clean responses', () => {
    const corpus = 'HTTP/2 200\nServer: nginx/1.21\nContent-Type: text/html\n';
    expect(matchSignatures(corpus)).toEqual([]);
  });

  it('reports multiple WAFs when stacked', () => {
    const corpus = [
      'HTTP/2 200',
      'CF-RAY: abc',
      'Server: cloudflare',
      'CF-Pages: production',
    ].join('\n');
    const names = matchSignatures(corpus).map((d) => d.name);
    expect(names).toContain('Cloudflare');
    expect(names).toContain('Cloudflare Pages');
  });

  it('is case-insensitive', () => {
    const corpus = 'HTTP/2 200\nSERVER: CLOUDFLARE\nCF-RAY: x\n';
    expect(matchSignatures(corpus).map((d) => d.name)).toContain('Cloudflare');
  });

  it('reports the patterns matched for evidence', () => {
    const corpus = 'CF-RAY: abc\nCF-Cache-Status: HIT\n';
    const r = matchSignatures(corpus).find((d) => d.name === 'Cloudflare');
    expect(r?.matched.length).toBeGreaterThan(0);
  });
});
