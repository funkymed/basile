import { ScannerRegistry } from '@basile/runner';
import { eslintScanner } from '@basile/scanner-eslint';
import { lighthouseScanner } from '@basile/scanner-lighthouse';
import { phpstanScanner } from '@basile/scanner-phpstan';

/**
 * Default scanner registry assembled from all bundled scanner packages.
 * Add new scanners here as packages are implemented.
 */
export function createDefaultRegistry(): ScannerRegistry {
  const registry = new ScannerRegistry();
  registry.register(eslintScanner);
  registry.register(lighthouseScanner);
  registry.register(phpstanScanner);
  return registry;
}
