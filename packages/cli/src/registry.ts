import { ScannerRegistry } from '@basile/runner';
import { composerAuditScanner } from '@basile/scanner-composer-audit';
import { eslintScanner } from '@basile/scanner-eslint';
import { lighthouseScanner } from '@basile/scanner-lighthouse';
import { phpcsScanner } from '@basile/scanner-phpcs';
import { phpstanScanner } from '@basile/scanner-phpstan';
import { wpscanScanner } from '@basile/scanner-wpscan';
import { tscScanner } from '@basile/scanner-tsc';
import { knipScanner } from '@basile/scanner-knip';
import { depcheckScanner } from '@basile/scanner-depcheck';
import { npmAuditScanner } from '@basile/scanner-npm-audit';
import { madgeScanner } from '@basile/scanner-madge';
import { semgrepScanner } from '@basile/scanner-semgrep';
import { bearerScanner } from '@basile/scanner-bearer';
import { gitleaksScanner } from '@basile/scanner-gitleaks';
import { trivyScanner } from '@basile/scanner-trivy';
import { clocScanner } from '@basile/scanner-cloc';
import { pa11yScanner } from '@basile/scanner-pa11y';
import { zapBaselineScanner } from '@basile/scanner-zap-baseline';
import { nucleiScanner } from '@basile/scanner-nuclei';
import { headersScanner } from '@basile/scanner-headers';
import { ssllabsScanner } from '@basile/scanner-ssllabs-scan';
import { testsslScanner } from '@basile/scanner-testssl';
import { subfinderScanner } from '@basile/scanner-subfinder';
import { wafw00fLiteScanner } from '@basile/scanner-wafw00f-lite';
import { attackSurfaceScanner } from '@basile/scanner-attack-surface';

/**
 * Default scanner registry assembled from all bundled scanner packages.
 * Add new scanners here as packages are implemented.
 */
export function createDefaultRegistry(): ScannerRegistry {
  const registry = new ScannerRegistry();
  registry.register(eslintScanner);
  registry.register(lighthouseScanner);
  registry.register(phpstanScanner);
  registry.register(phpcsScanner);
  registry.register(composerAuditScanner);
  registry.register(wpscanScanner);
  registry.register(tscScanner);
  registry.register(knipScanner);
  registry.register(depcheckScanner);
  registry.register(npmAuditScanner);
  registry.register(madgeScanner);
  registry.register(semgrepScanner);
  registry.register(bearerScanner);
  registry.register(gitleaksScanner);
  registry.register(trivyScanner);
  registry.register(clocScanner);
  registry.register(pa11yScanner);
  registry.register(zapBaselineScanner);
  registry.register(nucleiScanner);
  registry.register(headersScanner);
  registry.register(ssllabsScanner);
  registry.register(testsslScanner);
  // Recon / EASM (RFC-002)
  registry.register(subfinderScanner);
  registry.register(wafw00fLiteScanner);
  registry.register(attackSurfaceScanner);
  return registry;
}
