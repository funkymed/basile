import { describe, expect, it } from 'vitest';
import { listKnownScanners, REGISTRY, resolveInstallSteps } from './installers.js';

describe('installers', () => {
  it('exposes all major scanners', () => {
    const known = listKnownScanners();
    for (const s of ['phpstan', 'eslint', 'lighthouse', 'bearer', 'zap-baseline', 'semgrep', 'wpscan']) {
      expect(known).toContain(s);
    }
  });

  it('returns docker step for phpstan', () => {
    const step = resolveInstallSteps('phpstan', ['brew', 'npm']);
    expect(step).not.toBeNull();
    expect(step!.mode).toBe('docker');
    expect(step!.pretty).toContain('docker pull');
  });

  it('returns brew step for semgrep on darwin', () => {
    const platformBackup = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const step = resolveInstallSteps('semgrep', ['brew']);
      expect(step!.pretty).toContain('brew install');
    } finally {
      Object.defineProperty(process, 'platform', { value: platformBackup });
    }
  });

  it('returns null for unknown scanner', () => {
    expect(resolveInstallSteps('does-not-exist', ['brew'])).toBeNull();
  });

  it('every recipe has at least one install mode', () => {
    for (const [name, recipe] of Object.entries(REGISTRY)) {
      const hasMode = recipe.modes.local || recipe.modes.docker;
      expect(hasMode, `${name} has no install mode`).toBeTruthy();
    }
  });
});
