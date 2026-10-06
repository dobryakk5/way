# Deploy (putst.ru, Hetzner)

Everything that is deployed comes from git: commit, push, then on the server

```bash
cd /var/py/way && git pull --ff-only && ./deploy/deploy.sh
```
or locally

ssh hetz 'cd /var/py/way && git pull --ff-only && ./deploy/deploy.sh'

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

## E-mail sign-in

One-time 6-digit codes, issued and checked by the identity service (`/auth/email/*`, `/auth/me`).
Signing in links the e-mail to the browser's anonymous profile; signing in to an existing account moves
the profile's characters into that account and keeps the old id as an alias.

It is **off until a mail transport is configured**: add to `/etc/put-api.env`

```
MAIL_SMTP_URL=smtp://127.0.0.1:25        # the local Postfix
MAIL_FROM=Путь <noreply@putst.ru>
```

and `systemctl restart put-identity`. Without `MAIL_SMTP_URL` the game does not show the sign-in button.

Outgoing mail: `./deploy/setup-mail.sh` installs Postfix (loopback only) and OpenDKIM and prints the DKIM TXT
record. Before real delivery works you also need: the DKIM record published, reverse DNS (PTR) of the server
IP set to `putst.ru` (Hetzner Cloud console, server, Networking), and either Hetzner's outbound port 25 unlocked
or a relay over port 587 (`RELAYHOST=... ./deploy/setup-mail.sh`). SPF (`v=spf1 a -all`) and DMARC are already
in DNS.

## Not automated on purpose

- **Database migrations** (`server/db/migrations/*.sql`) are applied by hand, once each, in order, **before**
  `deploy.sh` when the new code needs them (the identity service reads `user_aliases` on every API request, 007):
  `sudo -u postgres psql -v ON_ERROR_STOP=1 -d way_db -c 'SET ROLE way_user' -f server/db/migrations/00N_*.sql`
  (the cluster is `18-main` on port 5433).
- **Content catalog**: after changing game content run `npm run persistence:catalog` and load
  `server/generated/content-catalog.v1.sql` into `way_db`.
