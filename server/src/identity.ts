import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import { RateLimiter, normalizeEmail, requestLoginCode, verifyLoginCode, type EmailLoginDeps, type Mailer } from './emailLogin.js';
import { createPgStore } from './emailLoginStore.js';
import {
  cookieValue,
  headerSignature,
  resolveIdentity,
  serializeCookie,
  verifyCookie,
  type IdentitySecrets
} from './identityCore.js';

const PORT = Number(process.env.IDENTITY_PORT ?? 8788);
const HOST = process.env.IDENTITY_HOST ?? '127.0.0.1';
const ALLOWED_ORIGIN = process.env.GAME_CORS_ORIGIN;
const MAX_BODY_BYTES = 4 * 1024;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be set to at least 32 characters`);
  return value;
}

const secrets: IdentitySecrets = {
  headerSecret: required('GAME_TRUSTED_USER_HEADER_SECRET'),
  cookieSecret: required('GAME_IDENTITY_COOKIE_SECRET')
};

const store = createPgStore(new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }));

/** E-mail sign-in is on only when a mail transport is configured (the local Postfix, normally). */
function createMailer(): Mailer | undefined {
  const url = process.env.MAIL_SMTP_URL;
  if (!url) return undefined;
  const from = process.env.MAIL_FROM ?? 'Путь <noreply@putst.ru>';
  const transport = nodemailer.createTransport(url);
  // Machine-generated: keeps auto-responders quiet and marks the message as transactional.
  const headers = { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' };
  return { send: async message => { await transport.sendMail({ from, headers, ...message }); } };
}

const mailer = createMailer();
const emailLogin: EmailLoginDeps | undefined = mailer
  ? { store, mailer, secret: secrets.cookieSecret }
  : undefined;

const requestsPerIp = new RateLimiter(20, 60 * 60 * 1000);
const verifiesPerIp = new RateLimiter(60, 60 * 60 * 1000);
const startsPerIp = new RateLimiter(30, 60 * 60 * 1000);

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new Error('UNSUPPORTED_MEDIA_TYPE');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown) : {};
}

function cookieHeader(req: IncomingMessage): string | undefined {
  const raw = req.headers.cookie;
  return Array.isArray(raw) ? raw.join('; ') : raw;
}

function clientIp(req: IncomingMessage): string {
  const raw = req.headers['x-real-ip'];
  return (Array.isArray(raw) ? raw[0] : raw) ?? req.socket.remoteAddress ?? 'unknown';
}

/** Browser-only endpoints: JSON bodies from the game's own origin. */
function sameOrigin(req: IncomingMessage): boolean {
  return Boolean(ALLOWED_ORIGIN) && req.headers.origin === ALLOWED_ORIGIN;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0];

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }

  // nginx auth_request target. It never rejects: a caller without a valid cookie becomes a fresh
  // anonymous user, and a browser whose profile was merged into an account is followed to that account.
  if (req.method === 'GET' && path === '/auth') {
    const identity = resolveIdentity(secrets, cookieHeader(req));
    const effective = await store.resolveUser(identity.userId);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-user-id', effective);
    res.setHeader('x-user-signature', headerSignature(secrets, effective));
    // Every API call renews the cookie, so a player who keeps coming back is remembered indefinitely.
    res.setHeader('set-cookie', serializeCookie(cookieValue(secrets, effective)));
    res.writeHead(200).end();
    return;
  }

  if (req.method === 'GET' && path === '/auth/me') {
    const raw = verifyCookie(secrets, cookieHeader(req));
    const user = raw ? await store.resolveUser(raw) : undefined;
    const email = user ? await store.emailOf(user) : undefined;
    const hasContact = user ? await store.hasContact(user) : false;
    json(res, 200, { emailLogin: Boolean(emailLogin), email: email ?? null, hasContact: hasContact || Boolean(email) });
    return;
  }

  // "Play" on the landing page: a never-seen e-mail starts the game at once, no code. An address that is
  // already known is never accepted on its word: it needs the code from its mailbox (/auth/email/verify).
  if (req.method === 'POST' && path === '/auth/email/start') {
    if (!sameOrigin(req)) {
      json(res, 403, { code: 'FORBIDDEN_ORIGIN' });
      return;
    }
    if (!startsPerIp.take(clientIp(req))) {
      json(res, 429, { code: 'RATE_LIMITED' });
      return;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'BAD_REQUEST';
      json(res, code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : code === 'BODY_TOO_LARGE' ? 413 : 400, { code });
      return;
    }
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const email = normalizeEmail(input.email);
    if (!email) {
      json(res, 422, { code: 'INVALID_EMAIL' });
      return;
    }
    const identity = resolveIdentity(secrets, cookieHeader(req));
    const mintedCookie = identity.setCookie ? { 'set-cookie': identity.setCookie } : {};
    const claim = await store.claimEmail(identity.userId, email);
    if (claim !== 'taken') {
      json(res, 200, { status: 'started' }, mintedCookie);
      return;
    }
    // The address already belongs to someone: only its mailbox can open it. The code is verified by
    // /auth/email/verify, which signs this browser in to that account.
    if (!emailLogin) {
      json(res, 503, { code: 'EMAIL_LOGIN_DISABLED' }, mintedCookie);
      return;
    }
    await requestLoginCode(emailLogin, { email, anonUserId: identity.userId });
    json(res, 202, { status: 'code' }, mintedCookie);
    return;
  }

  if (req.method === 'POST' && (path === '/auth/email/request' || path === '/auth/email/verify')) {
    if (!emailLogin) {
      json(res, 503, { code: 'EMAIL_LOGIN_DISABLED' });
      return;
    }
    if (!sameOrigin(req)) {
      json(res, 403, { code: 'FORBIDDEN_ORIGIN' });
      return;
    }
    const limiter = path === '/auth/email/request' ? requestsPerIp : verifiesPerIp;
    if (!limiter.take(clientIp(req))) {
      json(res, 429, { code: 'RATE_LIMITED' });
      return;
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'BAD_REQUEST';
      json(res, code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : code === 'BODY_TOO_LARGE' ? 413 : 400, { code });
      return;
    }
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

    // A code is bound to this browser's identity; mint one if the browser has none yet.
    const identity = resolveIdentity(secrets, cookieHeader(req));
    const mintedCookie = identity.setCookie ? { 'set-cookie': identity.setCookie } : {};

    if (path === '/auth/email/request') {
      const result = await requestLoginCode(emailLogin, { email: input.email, anonUserId: identity.userId });
      // 'throttled' answers like 'sent' so the endpoint does not reveal which addresses were asked for.
      if (result === 'invalid-email') json(res, 422, { code: 'INVALID_EMAIL' }, mintedCookie);
      else json(res, 202, { ok: true }, mintedCookie);
      return;
    }

    const result = await verifyLoginCode(emailLogin, {
      email: input.email,
      code: input.code,
      anonUserId: identity.userId
    });
    if (!result.ok) {
      json(res, result.reason === 'invalid-input' ? 422 : 401, { code: result.reason === 'invalid-input' ? 'INVALID_INPUT' : 'INVALID_CODE' }, mintedCookie);
      return;
    }
    json(res, 200, { email: result.email }, { 'set-cookie': serializeCookie(cookieValue(secrets, result.userId)) });
    return;
  }

  res.writeHead(404).end();
}

const server = createServer((req, res) => {
  handle(req, res).catch(error => {
    console.error('identity request failed', error);
    if (!res.headersSent) json(res, 503, { code: 'IDENTITY_UNAVAILABLE' });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Identity service listening on ${HOST}:${PORT} (e-mail login ${emailLogin ? 'on' : 'off'})`);
});
