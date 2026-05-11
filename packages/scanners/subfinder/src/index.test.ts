import { describe, it, expect } from 'vitest';
import { parseSubfinderOutput } from './index.js';

describe('parseSubfinderOutput', () => {
  it('parses simple stdout', () => {
    const stdout = ['api.example.com', 'app.example.com', 'www.example.com'].join('\n');
    expect(parseSubfinderOutput(stdout, 'example.com')).toEqual([
      'api.example.com',
      'app.example.com',
      'www.example.com',
    ]);
  });

  it('strips blank lines and ANSI noise', () => {
    const stdout = '\n  api.example.com  \n\nfoo.example.com\n';
    expect(parseSubfinderOutput(stdout, 'example.com')).toEqual([
      'api.example.com',
      'foo.example.com',
    ]);
  });

  it('lowercases hostnames', () => {
    expect(parseSubfinderOutput('API.Example.COM', 'example.com')).toEqual(['api.example.com']);
  });

  it('filters hosts outside the root scope', () => {
    const stdout = ['api.example.com', 'evil.com', 'foo.example.com.attacker.com'].join('\n');
    expect(parseSubfinderOutput(stdout, 'example.com')).toEqual([
      'api.example.com',
    ]);
  });

  it('drops wildcards', () => {
    const stdout = '*.example.com\napi.example.com\n*staging.example.com';
    expect(parseSubfinderOutput(stdout, 'example.com')).toEqual(['api.example.com']);
  });

  it('dedupes', () => {
    const stdout = 'api.example.com\napi.example.com\napi.example.com';
    expect(parseSubfinderOutput(stdout, 'example.com')).toEqual(['api.example.com']);
  });

  it('handles compound TLD root', () => {
    const stdout = 'api.example.co.uk\nshop.example.co.uk';
    expect(parseSubfinderOutput(stdout, 'example.co.uk')).toEqual([
      'api.example.co.uk',
      'shop.example.co.uk',
    ]);
  });

  it('returns empty for no matches', () => {
    expect(parseSubfinderOutput('foo.bar.com\n', 'example.com')).toEqual([]);
  });
});
