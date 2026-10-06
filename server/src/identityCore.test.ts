import { describe, expect, it } from 'vitest';
import {
  cookieValue,
  headerSignature,
  resolveIdentity,
  verifyCookie,
  type IdentitySecrets
} from './identityCore';

const secrets: IdentitySecrets = {
  headerSecret: 'h'.repeat(40),
  cookieSecret: 'c'.repeat(40)
};
const USER = '3f0c1d2e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

describe('anonymous identity', () => {
  it('mints a new signed identity and a hardened cookie when none is sent', () => {
    const identity = resolveIdentity(secrets, undefined);
    expect(identity.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.headerSignature).toBe(headerSignature(secrets, identity.userId));
    expect(identity.setCookie).toContain('HttpOnly');
    expect(identity.setCookie).toContain('Secure');
    expect(identity.setCookie).toContain('SameSite=Lax');
    expect(identity.setCookie).toContain(`put_uid=${identity.userId}.`);
  });

  it('keeps a valid identity and does not reissue the cookie', () => {
    const header = `theme=dark; put_uid=${cookieValue(secrets, USER)}`;
    const identity = resolveIdentity(secrets, header);
    expect(identity.userId).toBe(USER);
    expect(identity.setCookie).toBeUndefined();
    expect(identity.headerSignature).toBe(headerSignature(secrets, USER));
  });

  it('issues a different identity for a forged signature', () => {
    const forged = `put_uid=${USER}.${'0'.repeat(64)}`;
    expect(verifyCookie(secrets, forged)).toBeUndefined();
    expect(resolveIdentity(secrets, forged).userId).not.toBe(USER);
  });

  it('rejects a cookie signed with another secret', () => {
    const other = { ...secrets, cookieSecret: 'x'.repeat(40) };
    expect(verifyCookie(secrets, `put_uid=${cookieValue(other, USER)}`)).toBeUndefined();
  });

  it('rejects a user id swapped under a valid signature', () => {
    const [, signature] = cookieValue(secrets, USER).split('.');
    const other = '11111111-2222-4333-8444-555555555555';
    expect(verifyCookie(secrets, `put_uid=${other}.${signature}`)).toBeUndefined();
  });

  it('never accepts a cookie signature as a header signature', () => {
    const [, cookieSignature] = cookieValue(secrets, USER).split('.');
    expect(cookieSignature).not.toBe(headerSignature(secrets, USER));
  });

  it.each([
    'put_uid=',
    'put_uid=not-a-uuid.abc',
    `put_uid=${USER}`,
    `put_uid=${USER}.zz`,
    `put_uid=${USER}.${'a'.repeat(64)}.extra`
  ])('ignores malformed cookie %s', header => {
    expect(verifyCookie(secrets, header)).toBeUndefined();
  });

  it('picks the valid cookie when a forged one comes first', () => {
    const header = `put_uid=${USER}.${'0'.repeat(64)}; put_uid=${cookieValue(secrets, USER)}`;
    expect(verifyCookie(secrets, header)).toBe(USER);
  });
});
