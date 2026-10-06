// Runs against a real Postgres with migrations 001-007 applied:
//   TEST_DATABASE_URL=postgres://... npx vitest run server/src/emailLoginStore.test.ts
// Skipped when TEST_DATABASE_URL is not set.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CODE_MAX_ATTEMPTS } from './emailLogin';
import { createPgStore, type IdentityStore } from './emailLoginStore';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('pg login store', () => {
  const pool = new pg.Pool({ connectionString: url });
  const store: IdentityStore = createPgStore(pool);
  const created = { users: [] as string[], emails: [] as string[] };
  const future = () => new Date(Date.now() + 600_000);
  const hash = (n: number) => n.toString(16).padStart(64, '0');

  function fresh(): { user: string; email: string } {
    const user = randomUUID();
    const email = `${user.slice(0, 8)}@example.test`;
    created.users.push(user);
    created.emails.push(email);
    return { user, email };
  }

  async function login(email: string, user: string, code = 1) {
    await store.createCode({ email, anonUserId: user, codeHash: hash(code), expiresAt: future() });
    return store.consumeCode({ email, anonUserId: user, codeHash: hash(code), now: new Date() });
  }

  async function addCharacter(userId: string): Promise<string> {
    const id = randomUUID();
    await pool.query('INSERT INTO development_taxonomies(version) VALUES ($1) ON CONFLICT DO NOTHING', ['t-test']);
    await pool.query('INSERT INTO evidence_model_versions(version, taxonomy_version) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['e-test', 't-test']);
    await pool.query('INSERT INTO calculation_versions(version) VALUES ($1) ON CONFLICT DO NOTHING', ['c-test']);
    await pool.query(
      'INSERT INTO characters(id, user_id, taxonomy_version, evidence_model_version, calculation_version) VALUES ($1, $2, $3, $4, $5)',
      [id, userId, 't-test', 'e-test', 'c-test']
    );
    return id;
  }

  const ownerOf = async (characterId: string) =>
    (await pool.query<{ user_id: string }>('SELECT user_id FROM characters WHERE id = $1', [characterId])).rows[0]?.user_id;

  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    const users = created.users;
    await pool.query('DELETE FROM characters WHERE user_id = ANY($1::uuid[]) OR user_id IN (SELECT user_id FROM user_aliases WHERE alias_user_id = ANY($1::uuid[]))', [users]);
    await pool.query('DELETE FROM user_aliases WHERE alias_user_id = ANY($1::uuid[]) OR user_id = ANY($1::uuid[])', [users]);
    await pool.query('DELETE FROM user_emails WHERE email = ANY($1::text[])', [created.emails]);
    await pool.query('DELETE FROM email_login_codes WHERE email = ANY($1::text[])', [created.emails]);
    await pool.end();
  });

  it('links a new e-mail to the browser identity', async () => {
    const { user, email } = fresh();
    expect(await login(email, user)).toEqual({ ok: true, userId: user });
    expect(await store.emailOf(user)).toBe(email);
    expect(await store.resolveUser(user)).toBe(user);
  });

  it('keeps the same account when the same identity signs in again', async () => {
    const { user, email } = fresh();
    await login(email, user, 1);
    expect(await login(email, user, 2)).toEqual({ ok: true, userId: user });
  });

  it('merges an anonymous profile into the existing account and aliases the old id', async () => {
    const account = fresh();
    await login(account.email, account.user);
    const accountCharacter = await addCharacter(account.user);

    const anon = fresh();
    const anonCharacter = await addCharacter(anon.user);
    expect(await login(account.email, anon.user)).toEqual({ ok: true, userId: account.user });

    expect(await ownerOf(anonCharacter)).toBe(account.user);
    expect(await ownerOf(accountCharacter)).toBe(account.user);
    expect(await store.resolveUser(anon.user)).toBe(account.user);
  });

  it('flattens alias chains when an account is merged again', async () => {
    const final = fresh();
    await login(final.email, final.user);
    const middle = fresh();
    const early = fresh();
    await login(middle.email, middle.user);
    await login(middle.email, early.user); // early -> middle
    expect(await store.resolveUser(early.user)).toBe(middle.user);

    await login(final.email, middle.user); // middle (and its alias) -> final
    expect(await store.resolveUser(middle.user)).toBe(final.user);
    expect(await store.resolveUser(early.user)).toBe(final.user);
    expect(await store.emailOf(final.user)).toBe(final.email);
  });

  it('moves the e-mails of the merged profile to the surviving account', async () => {
    const account = fresh();
    await login(account.email, account.user);
    const other = fresh();
    await login(other.email, other.user);
    await login(account.email, other.user);
    const { rows } = await pool.query<{ user_id: string }>('SELECT user_id FROM user_emails WHERE email = $1', [other.email]);
    expect(rows[0]?.user_id).toBe(account.user);
  });

  it('rejects a wrong code, counts the attempt and locks after the limit', async () => {
    const { user, email } = fresh();
    await store.createCode({ email, anonUserId: user, codeHash: hash(1), expiresAt: future() });
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
      expect(await store.consumeCode({ email, anonUserId: user, codeHash: hash(99), now: new Date() })).toEqual({ ok: false });
    }
    // even the correct code is refused once the attempts are used up
    expect(await store.consumeCode({ email, anonUserId: user, codeHash: hash(1), now: new Date() })).toEqual({ ok: false });
    expect(await store.emailOf(user)).toBeUndefined();
  });

  it('refuses a code asked by another browser', async () => {
    const asker = fresh();
    const attacker = fresh();
    await store.createCode({ email: asker.email, anonUserId: asker.user, codeHash: hash(7), expiresAt: future() });
    expect(await store.consumeCode({ email: asker.email, anonUserId: attacker.user, codeHash: hash(7), now: new Date() })).toEqual({ ok: false });
    expect(await store.emailOf(attacker.user)).toBeUndefined();
  });

  it('refuses an expired code and a code that was already used', async () => {
    const { user, email } = fresh();
    await store.createCode({ email, anonUserId: user, codeHash: hash(3), expiresAt: new Date(Date.now() - 1000) });
    expect(await store.consumeCode({ email, anonUserId: user, codeHash: hash(3), now: new Date() })).toEqual({ ok: false });

    expect(await login(email, user, 4)).toEqual({ ok: true, userId: user });
    expect(await store.consumeCode({ email, anonUserId: user, codeHash: hash(4), now: new Date() })).toEqual({ ok: false });
  });

  it('counts recent codes per e-mail', async () => {
    const { user, email } = fresh();
    await store.createCode({ email, anonUserId: user, codeHash: hash(1), expiresAt: future() });
    await store.createCode({ email, anonUserId: user, codeHash: hash(2), expiresAt: future() });
    expect(await store.countRecentCodes(email, new Date(Date.now() - 60_000))).toBe(2);
    expect(await store.countRecentCodes(email, new Date(Date.now() + 60_000))).toBe(0);
  });
});
