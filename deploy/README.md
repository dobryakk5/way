# Deploy (putst.ru, Hetzner)

Everything that is deployed comes from git: commit, push, then on the server

```bash
cd /var/py/way && git pull --ff-only && ./deploy/deploy.sh
```

`deploy.sh` builds `server/` and the game (with `VITE_GAME_API_BASE_URL=https://putst.ru`),
publishes the game to `dist/app/`, the landing page and static files to `dist/`,
installs the systemd units, restarts the services and reloads nginx.

## What lives where

| What | Where |
| --- | --- |
| API (`server/src/index.ts`) | `put-api.service`, `127.0.0.1:8787` |
| Anonymous identity (`server/src/identity.ts`) | `put-identity.service`, `127.0.0.1:8788` |
| Units | `deploy/systemd/` |
| nginx `/api/` + `auth_request` | `deploy/nginx/putst-api.conf`, included from the `putst.ru` server block |
| Secrets (`DATABASE_URL`, `GAME_TRUSTED_USER_HEADER_SECRET`, `GAME_IDENTITY_COOKIE_SECRET`, `GAME_CORS_ORIGIN`) | `/etc/put-api.env` on the server, mode 600, **not in git** |
| Node 22 | `/opt/node22` |

The nginx server block for `putst.ru` (managed by certbot) contains one line:

```nginx
include /var/py/way/deploy/nginx/putst-api.conf;
```

## Not automated on purpose

- **Database migrations** (`server/db/migrations/*.sql`) are applied by hand, once each, in order:
  `sudo -u postgres psql -v ON_ERROR_STOP=1 -d way_db -c 'SET ROLE way_user' -f server/db/migrations/00N_*.sql`
  (the cluster is `18-main` on port 5433).
- **Content catalog**: after changing game content run `npm run persistence:catalog` and load
  `server/generated/content-catalog.v1.sql` into `way_db`.
