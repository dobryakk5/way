#!/usr/bin/env bash
# Re-records reports/focused-encounters-baseline.json with the ORIGINAL (stage 0) selectors on the CURRENT content.
# Use it in a content commit that legitimately changes legacy draws. Afterwards `npm run focused:baseline` (and the unit test)
# must say IDENTICAL: that proves the current engine with focusedEncounters=false still behaves exactly like the original one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="${FOCUSED_REFERENCE_SHA:-ac370ba}"   # stage 0: selectors before FOCUSED-ENCOUNTERS
TMP="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$TMP/wt" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
git -C "$ROOT" worktree add -q "$TMP/wt" "$REF"
ln -s "$ROOT/node_modules" "$TMP/wt/node_modules"
cp "$ROOT"/src/content/data/*.json "$TMP/wt/src/content/data/"
(cd "$TMP/wt" && npm run focused:baseline -- --write >/dev/null)
cp "$TMP/wt/reports/focused-encounters-baseline.json" "$ROOT/reports/focused-encounters-baseline.json"
echo "re-recorded with selectors of $REF on the current content"
