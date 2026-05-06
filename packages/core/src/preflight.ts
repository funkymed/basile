import {
  detectPackageManagers,
  resolveInstallSteps,
  verifyMany,
  type InstallStep,
  type InstallStatus,
  type PackageManager,
} from './installers.js';
import { listScannersInRecipe, type Recipe } from './recipe.js';

export type PreflightResult = {
  scanners: string[];
  statuses: InstallStatus[];
  ready: string[];
  missing: string[];
  unknown: string[];
  installPlan: InstallStep[];
  packageManagers: PackageManager[];
  ok: boolean;
};

export type PreflightInput =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'list'; scanners: string[] };

export async function preflight(input: PreflightInput): Promise<PreflightResult> {
  const scanners = input.kind === 'recipe' ? listScannersInRecipe(input.recipe) : [...new Set(input.scanners)];
  const statuses = await verifyMany(scanners);
  const pms = detectPackageManagers();

  const ready: string[] = [];
  const missing: string[] = [];
  const unknown: string[] = [];
  const installPlan: InstallStep[] = [];

  for (const status of statuses) {
    if (status.local === 'na' && status.docker === 'na') {
      unknown.push(status.scanner);
      continue;
    }
    if (status.ready) {
      ready.push(status.scanner);
      continue;
    }
    missing.push(status.scanner);
    const step = resolveInstallSteps(status.scanner, pms);
    if (step) installPlan.push(step);
  }

  return {
    scanners,
    statuses,
    ready,
    missing,
    unknown,
    installPlan,
    packageManagers: pms,
    ok: missing.length === 0 && unknown.length === 0,
  };
}

/**
 * Filtre une recipe pour retirer les scanners "skipped" et logue les coverage gaps.
 */
export function dropScannersFromRecipe(recipe: Recipe, drop: string[]): { recipe: Recipe; gaps: Array<{ target: string; scanner: string }> } {
  const dropSet = new Set(drop);
  const gaps: Array<{ target: string; scanner: string }> = [];
  const targets = recipe.targets.map((t) => {
    const filtered = t.scanners.filter((s) => {
      if (dropSet.has(s)) {
        gaps.push({ target: t.id, scanner: s });
        return false;
      }
      return true;
    });
    return { ...t, scanners: filtered };
  });
  return {
    recipe: { ...recipe, targets: targets.filter((t) => t.scanners.length > 0) as Recipe['targets'] },
    gaps,
  };
}
