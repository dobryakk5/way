#!/usr/bin/env bash
# Old saves under new content: generates saves with the PUBLISHED build (a temporary worktree of $PUBLISHED_SHA) and loads/continues them with the current build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="${PUBLISHED_SHA:-ae8bad7}"   # the release that players have today (main before FOCUSED-ENCOUNTERS)
TMP="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$TMP/wt" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
git -C "$ROOT" worktree add -q "$TMP/wt" "$SHA"
ln -s "$ROOT/node_modules" "$TMP/wt/node_modules"
cp "$ROOT/scripts/compat-old-saves.ts" "$TMP/wt/scripts/"
(cd "$TMP/wt" && node --import tsx scripts/compat-old-saves.ts generate "$TMP/saves")
(cd "$ROOT" && node --import tsx scripts/compat-old-saves.ts verify "$TMP/saves")
