import { describe, it, expect } from 'vitest';
import { ssllabsScanner, parseSslLabsJson } from './index.js';

describe('ssllabsScanner', () => {
  it('declares its identity', () => {
    expect(ssllabsScanner.name).toBe('ssllabs-scan');
    expect(ssllabsScanner.category).toBe('security');
  });

  it('parses endpoints with grade severity mapping', () => {
    const json = JSON.stringify([
      {
        host: 'example.com',
        endpoints: [
          { ipAddress: '1.1.1.1', grade: 'A+', statusMessage: 'Ready' },
          { ipAddress: '2.2.2.2', grade: 'C', statusMessage: 'Ready' },
          { ipAddress: '3.3.3.3', grade: 'F', statusMessage: 'Ready' },
        ],
      },
    ]);
    const findings = parseSslLabsJson(json, 't1');
    expect(findings).toHaveLength(3);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[1]?.severity).toBe('high');
    expect(findings[2]?.severity).toBe('critical');
  });
});
