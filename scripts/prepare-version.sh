#!/usr/bin/env bash
# Prepares a new version: bumps package.json files, runs checks, builds, packs.
# Does NOT commit, tag, or publish — leaves that to the maintainer.
#
# Usage: ./scripts/prepare-version.sh <version>
# Example: ./scripts/prepare-version.sh 0.0.2

set -euo pipefail

# ─── colors ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_BLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_BLD=''; C_RST=''
fi

step() { echo "${C_BLU}▸${C_RST} ${C_BLD}$*${C_RST}"; }
ok()   { echo "${C_GRN}✓${C_RST} $*"; }
warn() { echo "${C_YLW}!${C_RST} $*"; }
die()  { echo "${C_RED}✗${C_RST} $*" >&2; exit 1; }

# ─── args ─────────────────────────────────────────────────────────────────────
VERSION="${1:-}"
[[ -z "$VERSION" ]] && die "Usage: $0 <version>  (e.g. 0.0.2)"

# strict semver: MAJOR.MINOR.PATCH (+ optional -prerelease)
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  die "Invalid semver: $VERSION"
fi

# ─── repo root ────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ─── preconditions ────────────────────────────────────────────────────────────
step "Pre-checks"

command -v pnpm >/dev/null || die "pnpm not found"
command -v npm  >/dev/null || die "npm not found"
command -v jq   >/dev/null || die "jq not found (brew install jq)"

CURRENT="$(jq -r .version package.json)"
SAME_VERSION=0
if [[ "$CURRENT" == "$VERSION" ]]; then
  warn "Version already at $VERSION — rebuilding tarball without bump"
  SAME_VERSION=1
else
  # Compare semver: refuse downgrade
  LOWER="$(printf '%s\n%s\n' "$CURRENT" "$VERSION" | sort -V | head -1)"
  [[ "$LOWER" == "$VERSION" ]] && die "Refusing downgrade: $CURRENT → $VERSION"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Working tree has uncommitted changes"
  read -r -p "Continue anyway? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted"
fi

ok "From $CURRENT → $VERSION"

# ─── quality gates ────────────────────────────────────────────────────────────
step "pnpm install"
pnpm install --frozen-lockfile=false

step "pnpm -r build (pre-typecheck — generate dist/ for workspace deps)"
pnpm -r build

step "pnpm -r typecheck"
pnpm -r typecheck

step "pnpm -r test"
pnpm -r test

step "pnpm -r lint"
pnpm -r lint || warn "Lint reported issues — review before publish"

# ─── version bump (always, idempotent) ────────────────────────────────────────
step "Set root package.json → $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null

step "Set all workspace packages → $VERSION"
pnpm -r exec npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null

step "Verify alignment"
MISMATCH=0
while IFS= read -r f; do
  v="$(jq -r .version "$f")"
  if [[ "$v" != "$VERSION" ]]; then
    warn "${f#./}: $v"
    MISMATCH=1
  fi
done < <(find . -name package.json -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path './deploy/*')
[[ "$MISMATCH" -eq 1 ]] && die "Some packages not at $VERSION — bump failed"
ok "All workspaces at $VERSION"

# ─── build + pack ─────────────────────────────────────────────────────────────
step "pnpm -r build"
pnpm -r build

step "pnpm pack:cli"
pnpm pack:cli

TARBALL="funkymed-basile-${VERSION}.tgz"
[[ -f "$TARBALL" ]] || die "Tarball not produced: $TARBALL"

# ─── summary ──────────────────────────────────────────────────────────────────
echo
ok "Version $VERSION prepared."
echo
echo "${C_BLD}Next steps:${C_RST}"
cat <<EOF

  # Smoke-test
  npx --package=file:./$TARBALL basile doctor

  # Dry-run publish
  npm publish ./$TARBALL --access public --dry-run

  # Commit + tag
  git add -A
  git commit -m "chore(release): $VERSION"
  git tag v$VERSION
  git push origin HEAD
  git push origin v$VERSION

  # Publish
  npm publish ./$TARBALL --access public

EOF
