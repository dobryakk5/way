import { describe, expect, it, vi } from 'vitest';
import {
  CODE_TTL_MS,
  CODES_PER_EMAIL,
  RateLimiter,
  hashCode,
  normalizeEmail,
  randomCode,
  requestLoginCode,
  verifyLoginCode,
  type EmailLoginDeps,
  type LoginStore
} from './emailLogin';

const USER = '3f0c1d2e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const SECRET = 's'.repeat(40);
const NOW = new Date('2026-10-06T12:00:00.000Z');

function setup(overrides: Partial<LoginStore> = {}) {
  const store: LoginStore = {
    countRecentCodes: vi.fn(async () => 0),
    createCode: vi.fn(async () => undefined),
    consumeCode: vi.fn(async () => ({ ok: true as const, userId: USER })),
    ...overrides
  };
  const mailer = { send: vi.fn(async () => undefined) };
  const deps: EmailLoginDeps = { store, mailer, secret: SECRET, now: () => NOW, generateCode: () => '042517' };
  return { store, mailer, deps };
}

describe('normalizeEmail', () => {
  it.each([
    ['  Anna@Example.COM ', 'anna@example.com'],
    ['a.b+tag@mail.ru', 'a.b+tag@mail.ru']
  ])('normalizes %j', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it.each(['', 'no-at.example.com', 'a@b', 'a b@example.com', 'a@@example.com', 42, null, `${'x'.repeat(250)}@example.com`])(
    'rejects %j',
    raw => {
      expect(normalizeEmail(raw)).toBeUndefined();
    }
  );
});

describe('randomCode', () => {
  it('is always six digits', () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
});

describe('requestLoginCode', () => {
  it('stores only a hash bound to the browser identity and mails the code', async () => {
    const { store, mailer, deps } = setup();
    expect(await requestLoginCode(deps, { email: 'Anna@Example.com', anonUserId: USER })).toBe('sent');

    expect(store.createCode).toHaveBeenCalledWith({
      email: 'anna@example.com',
      anonUserId: USER,
      codeHash: hashCode(SECRET, 'anna@example.com', USER, '042517'),
      expiresAt: new Date(NOW.getTime() + CODE_TTL_MS)
    });
    const stored = JSON.stringify(vi.mocked(store.createCode).mock.calls);
    expect(stored).not.toContain('042517');
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'anna@example.com', subject: 'Код входа: 042517', text: expect.stringContaining('042517') })
    );
  });

  it('rejects an invalid address without sending anything', async () => {
    const { store, mailer, deps } = setup();
    expect(await requestLoginCode(deps, { email: 'nope', anonUserId: USER })).toBe('invalid-email');
    expect(store.createCode).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('throttles repeated requests for one address', async () => {
    const { store, mailer, deps } = setup({ countRecentCodes: vi.fn(async () => CODES_PER_EMAIL) });
    expect(await requestLoginCode(deps, { email: 'anna@example.com', anonUserId: USER })).toBe('throttled');
    expect(store.createCode).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('does not keep a usable code when the mail cannot be sent', async () => {
    const { mailer, deps } = setup();
    mailer.send.mockRejectedValueOnce(new Error('smtp down'));
    await expect(requestLoginCode(deps, { email: 'anna@example.com', anonUserId: USER })).rejects.toThrow('smtp down');
  });
});

describe('verifyLoginCode', () => {
  it('passes the code hash for this e-mail and browser to the store', async () => {
    const { store, deps } = setup();
    const result = await verifyLoginCode(deps, { email: ' Anna@Example.com', code: ' 042517 ', anonUserId: USER });

    expect(result).toEqual({ ok: true, userId: USER, email: 'anna@example.com' });
    expect(store.consumeCode).toHaveBeenCalledWith({
      email: 'anna@example.com',
      anonUserId: USER,
      codeHash: hashCode(SECRET, 'anna@example.com', USER, '042517'),
      now: NOW
    });
  });

  it('gives a code issued to another browser a different hash', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    expect(hashCode(SECRET, 'anna@example.com', USER, '042517')).not.toBe(hashCode(SECRET, 'anna@example.com', other, '042517'));
  });

  it.each(['12345', '1234567', 'abcdef', '12 456', 123456, undefined])('rejects malformed code %j without touching the store', async code => {
    const { store, deps } = setup();
    expect(await verifyLoginCode(deps, { email: 'anna@example.com', code, anonUserId: USER })).toEqual({
      ok: false,
      reason: 'invalid-input'
    });
    expect(store.consumeCode).not.toHaveBeenCalled();
  });

  it('reports a wrong or expired code uniformly', async () => {
    const { deps } = setup({ consumeCode: vi.fn(async () => ({ ok: false as const })) });
    expect(await verifyLoginCode(deps, { email: 'anna@example.com', code: '000000', anonUserId: USER })).toEqual({
      ok: false,
      reason: 'invalid-code'
    });
  });
});

describe('RateLimiter', () => {
  it('allows the limit, blocks the next call and recovers after the window', () => {
    let now = 1_000;
    const limiter = new RateLimiter(2, 100, () => now);
    expect([limiter.take('ip'), limiter.take('ip'), limiter.take('ip')]).toEqual([true, true, false]);
    expect(limiter.take('other')).toBe(true);
    now += 101;
    expect(limiter.take('ip')).toBe(true);
  });
});
