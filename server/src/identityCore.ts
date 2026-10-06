import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const IDENTITY_COOKIE = 'put_uid';
export const IDENTITY_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_RE = /^[0-9a-f]{64}$/i;

export interface IdentitySecrets {
  /** Signs the `x-user-signature` header the API verifies (same key as the API's GAME_TRUSTED_USER_HEADER_SECRET). */
  headerSecret: string;
  /** Signs the browser cookie. Separate key, so a cookie value can never double as a header signature. */
  cookieSecret: string;
}

export interface Identity {
  userId: string;
  headerSignature: string;
  /** Present only when a new cookie has to be handed to the browser. */
  setCookie?: string;
}

function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function headerSignature(secrets: IdentitySecrets, userId: string): string {
  return hmacHex(secrets.headerSecret, userId);
}

export function cookieValue(secrets: IdentitySecrets, userId: string): string {
  return `${userId}.${hmacHex(secrets.cookieSecret, `${IDENTITY_COOKIE}:${userId}`)}`;
}

export function serializeCookie(value: string): string {
  return `${IDENTITY_COOKIE}=${value}; Path=/; Max-Age=${IDENTITY_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

/** Returns the user id of the first correctly signed identity cookie, if any. */
export function verifyCookie(secrets: IdentitySecrets, cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${IDENTITY_COOKIE}=`)) continue;
    const [userId, signature, ...rest] = trimmed.slice(IDENTITY_COOKIE.length + 1).split('.');
    if (!userId || !signature || rest.length || !UUID_RE.test(userId) || !SIGNATURE_RE.test(signature)) continue;
    if (sameHex(signature, hmacHex(secrets.cookieSecret, `${IDENTITY_COOKIE}:${userId}`))) return userId.toLowerCase();
  }
  return undefined;
}

/** Resolves the caller's identity, minting a new anonymous one when the cookie is missing or forged. */
export function resolveIdentity(secrets: IdentitySecrets, cookieHeader: string | undefined): Identity {
  const existing = verifyCookie(secrets, cookieHeader);
  if (existing) return { userId: existing, headerSignature: headerSignature(secrets, existing) };

  const userId = randomUUID();
  return {
    userId,
    headerSignature: headerSignature(secrets, userId),
    setCookie: serializeCookie(cookieValue(secrets, userId))
  };
}
