import { createServer } from 'node:http';
import { resolveIdentity, type IdentitySecrets } from './identityCore.js';

const PORT = Number(process.env.IDENTITY_PORT ?? 8788);
const HOST = process.env.IDENTITY_HOST ?? '127.0.0.1';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be set to at least 32 characters`);
  return value;
}

const secrets: IdentitySecrets = {
  headerSecret: required('GAME_TRUSTED_USER_HEADER_SECRET'),
  cookieSecret: required('GAME_IDENTITY_COOKIE_SECRET')
};

/**
 * nginx `auth_request` target. It never rejects: a caller without a valid cookie
 * becomes a fresh anonymous user. The user only exists in the database once the
 * game creates a character for it.
 */
const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (req.method !== 'GET' || path !== '/auth') {
    res.writeHead(404).end();
    return;
  }

  const cookie = req.headers.cookie;
  const identity = resolveIdentity(secrets, Array.isArray(cookie) ? cookie.join('; ') : cookie);
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-user-id', identity.userId);
  res.setHeader('x-user-signature', identity.headerSignature);
  if (identity.setCookie) res.setHeader('set-cookie', identity.setCookie);
  res.writeHead(200).end();
});

server.listen(PORT, HOST, () => {
  console.log(`Identity service listening on ${HOST}:${PORT}`);
});
