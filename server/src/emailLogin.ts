import { createHmac, randomInt } from 'node:crypto';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODES_PER_EMAIL = 3;
export const CODES_WINDOW_MS = 15 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_RE = /^\d{6}$/;

export interface LoginStore {
  countRecentCodes(email: string, since: Date): Promise<number>;
  createCode(input: { email: string; anonUserId: string; codeHash: string; expiresAt: Date }): Promise<void>;
  /** Checks the code atomically; on a match links the e-mail to the caller or merges accounts. */
  consumeCode(input: {
    email: string;
    anonUserId: string;
    codeHash: string;
    now: Date;
  }): Promise<{ ok: true; userId: string } | { ok: false }>;
}

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface EmailLoginDeps {
  store: LoginStore;
  mailer: Mailer;
  /** Keys the code hash. */
  secret: string;
  now?: () => Date;
  generateCode?: () => string;
}

export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : undefined;
}

export function randomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(secret: string, email: string, anonUserId: string, code: string): string {
  return createHmac('sha256', secret).update(`email-code:${email}:${anonUserId}:${code}`).digest('hex');
}

export type RequestCodeResult = 'sent' | 'throttled' | 'invalid-email';

export async function requestLoginCode(
  deps: EmailLoginDeps,
  input: { email: unknown; anonUserId: string }
): Promise<RequestCodeResult> {
  const email = normalizeEmail(input.email);
  if (!email) return 'invalid-email';

  const now = (deps.now ?? (() => new Date()))();
  const recent = await deps.store.countRecentCodes(email, new Date(now.getTime() - CODES_WINDOW_MS));
  if (recent >= CODES_PER_EMAIL) return 'throttled';

  const code = (deps.generateCode ?? randomCode)();
  await deps.store.createCode({
    email,
    anonUserId: input.anonUserId,
    codeHash: hashCode(deps.secret, email, input.anonUserId, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS)
  });
  await deps.mailer.send({
    to: email,
    subject: `Код входа: ${code}`,
    text: [
      `Код для входа в «Путь»: ${code}`,
      '',
      `Он действует ${CODE_TTL_MS / 60000} минут. Введите его на странице игры, где вы запросили вход.`,
      'Если вы не запрашивали вход, просто проигнорируйте это письмо.'
    ].join('\n')
  });
  return 'sent';
}

export type VerifyCodeResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: 'invalid-input' | 'invalid-code' };

export async function verifyLoginCode(
  deps: EmailLoginDeps,
  input: { email: unknown; code: unknown; anonUserId: string }
): Promise<VerifyCodeResult> {
  const email = normalizeEmail(input.email);
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!email || !CODE_RE.test(code)) return { ok: false, reason: 'invalid-input' };

  const result = await deps.store.consumeCode({
    email,
    anonUserId: input.anonUserId,
    codeHash: hashCode(deps.secret, email, input.anonUserId, code),
    now: (deps.now ?? (() => new Date()))()
  });
  return result.ok ? { ok: true, userId: result.userId, email } : { ok: false, reason: 'invalid-code' };
}

/** Fixed-window counter, used per client address. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** Returns true when the call is allowed. */
  take(key: string): boolean {
    const now = this.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }
}
