#!/usr/bin/env bash
# The server catalog on a throwaway PostgreSQL: migrations, the catalog of the PUBLISHED build, then the CURRENT one on top.
# Checks that the second load only adds (nothing published is rewritten) and shows what ON CONFLICT DO NOTHING means for an edited text.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# the server binaries (the libpq client package also ships an initdb without a server): PG_BIN overrides
PG_BIN="${PG_BIN:-$(ls -d /opt/homebrew/opt/postgresql@*/bin 2>/dev/null | tail -1)}"; [ -n "$PG_BIN" ] && export PATH="$PG_BIN:$PATH"
SHA="${PUBLISHED_SHA:-ae8bad7}"
TMP="$(mktemp -d)"; PORT="${PGPORT_TEST:-55437}"; SOCK="$(mktemp -d /tmp/pgs.XXXXXX)"   # a short path: unix socket paths are limited to ~100 characters
PG="psql -q -h $SOCK -p $PORT -U postgres -v ON_ERROR_STOP=1"
cleanup() { [ -f "$TMP/pg.log" ] && [ -n "${PG_FAILED:-}" ] && tail -5 "$TMP/pg.log" >&2; rm -rf "$SOCK"; pg_ctl -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true; git -C "$ROOT" worktree remove --force "$TMP/wt" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
git -C "$ROOT" worktree add -q "$TMP/wt" "$SHA"; ln -s "$ROOT/node_modules" "$TMP/wt/node_modules"
(cd "$TMP/wt" && npm run persistence:catalog >/dev/null 2>&1)
(cd "$ROOT" && npm run persistence:catalog >/dev/null 2>&1)
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8   # postgres refuses to start multithreaded without a proper locale on macOS
initdb -D "$TMP/data" -U postgres --auth=trust --locale=en_US.UTF-8 >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null || { PG_FAILED=1; exit 1; }
$PG -d postgres -c "CREATE ROLE way_user SUPERUSER LOGIN;" -c "CREATE DATABASE way_db OWNER way_user;"
for m in "$ROOT"/server/db/migrations/00[1-6]_*.sql; do $PG -d way_db -f "$m" >/dev/null; done
q() { $PG -d way_db -At -c "$1"; }
$PG -d way_db -f "$TMP/wt/server/generated/content-catalog.v1.sql" >/dev/null
echo "published catalog loaded: scenes=$(q 'select count(*) from game_scenes') presentations=$(q 'select count(*) from scene_presentations') choices=$(q 'select count(*) from game_choices') choice_presentations=$(q 'select count(*) from choice_presentations')"
q "select md5(string_agg(id::text||text, '|' order by id)) from scene_presentations" > "$TMP/scene.before"
q "select md5(string_agg(id::text||text, '|' order by id)) from choice_presentations" > "$TMP/choice.before"
$PG -d way_db -f "$ROOT/server/generated/content-catalog.v1.sql" >/dev/null
echo "current catalog loaded on top: scenes=$(q 'select count(*) from game_scenes') presentations=$(q 'select count(*) from scene_presentations') choices=$(q 'select count(*) from game_choices') choice_presentations=$(q 'select count(*) from choice_presentations')"
# published rows must be byte-identical after the second load
q "select md5(string_agg(id::text||text, '|' order by id)) from scene_presentations where id in (select id from scene_presentations where created_at <= (select min(created_at)+interval '1 minute' from scene_presentations))" >/dev/null
OLD_IDS=$(cd "$TMP/wt" && node -e "const c=require('./server/generated/content-catalog.v1.json');console.log(c.scenes.flatMap(s=>s.presentations.map(p=>p.id)).join(','))")
OLD_CH=$(cd "$TMP/wt" && node -e "const c=require('./server/generated/content-catalog.v1.json');console.log(c.scenes.flatMap(s=>s.choices.map(x=>x.presentation.id)).join(','))")
echo "published scene presentations unchanged: $( [ "$(q "select md5(string_agg(id::text||text, '|' order by id)) from scene_presentations where id in ($OLD_IDS)")" = "$(cd "$TMP/wt" && node -e "const c=require('./server/generated/content-catalog.v1.json');const crypto=require('crypto');const rows=c.scenes.flatMap(s=>s.presentations).sort((a,b)=>a.id-b.id).map(p=>p.id+p.text).join('|');console.log(crypto.createHash('md5').update(rows).digest('hex'))")" ] && echo yes || echo NO )"
echo "published choice presentations unchanged: $( [ "$(q "select md5(string_agg(id::text||text, '|' order by id)) from choice_presentations where id in ($OLD_CH)")" = "$(cd "$TMP/wt" && node -e "const c=require('./server/generated/content-catalog.v1.json');const crypto=require('crypto');const rows=c.scenes.flatMap(s=>s.choices).map(x=>x.presentation).sort((a,b)=>a.id-b.id).map(p=>p.id+p.text).join('|');console.log(crypto.createHash('md5').update(rows).digest('hex'))")" ] && echo yes || echo NO )"
# what happens to a text edited in place: the row keeps the OLD text (ON CONFLICT DO NOTHING), the new text is never stored
ID=$(q "select id from scene_presentations order by id limit 1")
sed "s/^\(INSERT INTO scene_presentations.* VALUES ($ID,.*\), '\(.*\)') ON CONFLICT DO NOTHING;/\1, 'EDITED IN PLACE') ON CONFLICT DO NOTHING;/" "$ROOT/server/generated/content-catalog.v1.sql" > "$TMP/edited.sql"
$PG -d way_db -f "$TMP/edited.sql" >/dev/null
echo "a presentation text edited in place and loaded again: stored text is now '$(q "select left(text, 30) from scene_presentations where id=$ID")' (edited text stored: $( [ "$(q "select count(*) from scene_presentations where text='EDITED IN PLACE'")" != 0 ] && echo YES || echo no ))"
