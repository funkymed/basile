import { describe, it, expect } from 'vitest';
import { extractRootDomain, normalizeHostInput, categorizeHost } from './domain.js';

describe('normalizeHostInput', () => {
  it('strips scheme', () => {
    expect(normalizeHostInput('https://example.com')).toBe('example.com');
    expect(normalizeHostInput('http://example.com')).toBe('example.com');
  });
  it('strips path', () => {
    expect(normalizeHostInput('https://example.com/path/to/x')).toBe('example.com');
  });
  it('strips port', () => {
    expect(normalizeHostInput('example.com:443')).toBe('example.com');
  });
  it('lowercases', () => {
    expect(normalizeHostInput('Example.COM')).toBe('example.com');
  });
  it('strips query + fragment', () => {
    expect(normalizeHostInput('https://example.com?q=1#frag')).toBe('example.com');
  });
});

describe('extractRootDomain', () => {
  it('returns root when input is already root', () => {
    const r = extractRootDomain('example.com');
    expect(r.root).toBe('example.com');
    expect(r.wasSubdomain).toBe(false);
  });
  it('strips subdomain', () => {
    const r = extractRootDomain('https://api.example.com');
    expect(r.root).toBe('example.com');
    expect(r.wasSubdomain).toBe(true);
  });
  it('handles compound TLD .co.uk', () => {
    const r = extractRootDomain('foo.example.co.uk');
    expect(r.root).toBe('example.co.uk');
    expect(r.wasSubdomain).toBe(true);
  });
  it('handles compound TLD .com.br', () => {
    const r = extractRootDomain('app.shop.com.br');
    expect(r.root).toBe('shop.com.br');
  });
  it('keeps deep subdomain stripped', () => {
    const r = extractRootDomain('a.b.c.example.com');
    expect(r.root).toBe('example.com');
  });
  it('throws on single-label input', () => {
    expect(() => extractRootDomain('localhost')).toThrow();
  });
  it('throws on TLD-only input', () => {
    expect(() => extractRootDomain('co.uk')).toThrow();
  });
});

describe('categorizeHost', () => {
  const root = 'example.com';
  it('detects internal services', () => {
    expect(categorizeHost('internal.example.com', root)).toBe('internal');
    expect(categorizeHost('grafana.example.com', root)).toBe('internal');
    expect(categorizeHost('argocd.example.com', root)).toBe('internal');
  });
  it('detects dev/staging envs', () => {
    expect(categorizeHost('staging.example.com', root)).toBe('dev_staging');
    expect(categorizeHost('dev.example.com', root)).toBe('dev_staging');
    expect(categorizeHost('test.example.com', root)).toBe('dev_staging');
    expect(categorizeHost('preprod.example.com', root)).toBe('dev_staging');
  });
  it('detects admin', () => {
    expect(categorizeHost('admin.example.com', root)).toBe('admin');
  });
  it('detects api', () => {
    expect(categorizeHost('api.example.com', root)).toBe('api');
    expect(categorizeHost('graphql.example.com', root)).toBe('api');
  });
  it('detects app', () => {
    expect(categorizeHost('app.example.com', root)).toBe('app');
    expect(categorizeHost('my.example.com', root)).toBe('app');
  });
  it('detects docs', () => {
    expect(categorizeHost('docs.example.com', root)).toBe('docs');
    expect(categorizeHost('help.example.com', root)).toBe('docs');
  });
  it('detects infra/cdn', () => {
    expect(categorizeHost('cdn.example.com', root)).toBe('infra');
    expect(categorizeHost('static.example.com', root)).toBe('infra');
  });
  it('detects marketing on root + www', () => {
    expect(categorizeHost('example.com', root)).toBe('marketing');
    expect(categorizeHost('www.example.com', root)).toBe('marketing');
  });
  it('prioritizes internal over generic', () => {
    expect(categorizeHost('internal-api.example.com', root)).toBe('internal');
  });
  it('falls back to unknown', () => {
    expect(categorizeHost('foobar.example.com', root)).toBe('unknown');
  });
});
