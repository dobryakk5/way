#!/usr/bin/env bash
# Deploy on the server after `git pull`:
#
#   cd /var/py/way && git pull --ff-only && ./deploy/deploy.sh
#
# Builds the API and the game from the checked-out commit and publishes them.
# Secrets live in /etc/put-api.env and are never part of the repository.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH=/opt/node22/bin:$PATH

WEB_ROOT=${WEB_ROOT:-/var/py/way/dist}
API_BASE=${VITE_GAME_API_BASE_URL:-https://putst.ru}
BUILD_DIR=.deploy-build

echo "== deploying $(git rev-parse --short HEAD)"

echo "== API"
(cd server && npm ci --no-audit --no-fund && npm run build)

echo "== game (API base: $API_BASE)"
npm ci --no-audit --no-fund
# The game is served under /app/, the web root also holds the landing page, so
# build outside WEB_ROOT: a default `vite build` would empty it.
VITE_GAME_API_BASE_URL="$API_BASE" npm run build -- --outDir "$BUILD_DIR" --emptyOutDir

echo "== publish to $WEB_ROOT"
mkdir -p "$WEB_ROOT/app"
rsync -rlt --delete --chmod=D755,F644 "$BUILD_DIR"/ "$WEB_ROOT/app/"
install -m 644 landing.html "$WEB_ROOT/index.html"
for file in favicon.svg favicon-32x32.png apple-touch-icon.png og-image.png robots.txt sitemap.xml; do
  install -m 644 "$file" "$WEB_ROOT/$file"
done

echo "== services"
install -m 644 deploy/systemd/put-api.service deploy/systemd/put-identity.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable put-api put-identity >/dev/null
systemctl restart put-api put-identity

echo "== nginx"
nginx -t
systemctl reload nginx

sleep 2
systemctl is-active put-api put-identity
curl -fsS http://127.0.0.1:8787/health && echo
curl -fsS http://127.0.0.1:8788/health && echo
echo "== done"
