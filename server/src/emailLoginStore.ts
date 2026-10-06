import { timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { CODE_MAX_ATTEMPTS, type LoginStore } from './emailLogin.js';

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

async function rootUser(client: Pool | PoolClient, userId: string): Promise<string> {
  const { rows } = await client.query<{ user_id: string }>(
    'SELECT user_id FROM user_aliases WHERE alias_user_id = $1',
    [userId]
  );
  return rows[0]?.user_id ?? userId;
}

export interface IdentityStore extends LoginStore {
  /** The account a browser identity currently belongs to (follows merges). */
  resolveUser(userId: string): Promise<string>;
  emailOf(userId: string): Promise<string | undefined>;
}

export function createPgStore(pool: Pool): IdentityStore {
  return {
    resolveUser: userId => rootUser(pool, userId),

    async emailOf(userId) {
      const { rows } = await pool.query<{ email: string }>(
        'SELECT email FROM user_emails WHERE user_id = $1 ORDER BY verified_at, email LIMIT 1',
        [userId]
      );
      return rows[0]?.email;
    },

    async countRecentCodes(email, since) {
      const { rows } = await pool.query<{ n: string }>(
        'SELECT count(*) AS n FROM email_login_codes WHERE email = $1 AND created_at >= $2',
        [email, since]
      );
      return Number(rows[0]?.n ?? 0);
    },

    async createCode({ email, anonUserId, codeHash, expiresAt }) {
      await pool.query(
        'INSERT INTO email_login_codes (email, anon_user_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
        [email, anonUserId, codeHash, expiresAt]
      );
    },

    async consumeCode({ email, anonUserId, codeHash, now }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // One verification per e-mail at a time; account merges are rare, so they share one global lock.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`put-email-login:${email}`]);

        const { rows } = await client.query<{ id: string; code_hash: string }>(
          `SELECT id, code_hash
             FROM email_login_codes
            WHERE email = $1 AND anon_user_id = $2
              AND used_at IS NULL AND expires_at > $3 AND attempts < $4
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE`,
          [email, anonUserId, now, CODE_MAX_ATTEMPTS]
        );
        const row = rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return { ok: false };
        }
        if (!sameHash(row.code_hash, codeHash)) {
          await client.query('UPDATE email_login_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
          await client.query('COMMIT');
          return { ok: false };
        }
        await client.query('UPDATE email_login_codes SET used_at = $2 WHERE id = $1', [row.id, now]);

        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['put-identity-merge']);
        const caller = await rootUser(client, anonUserId);
        const existing = await client.query<{ user_id: string }>(
          'SELECT user_id FROM user_emails WHERE email = $1',
          [email]
        );
        const owner = existing.rows[0]?.user_id;

        let target = caller;
        if (!owner) {
          await client.query('INSERT INTO user_emails (email, user_id) VALUES ($1, $2)', [email, caller]);
        } else if (owner !== caller) {
          target = owner;
          await client.query('UPDATE characters SET user_id = $2 WHERE user_id = $1', [caller, target]);
          await client.query('UPDATE user_emails SET user_id = $2 WHERE user_id = $1', [caller, target]);
          await client.query('UPDATE user_aliases SET user_id = $2 WHERE user_id = $1', [caller, target]);
          await client.query(
            `INSERT INTO user_aliases (alias_user_id, user_id) VALUES ($1, $2)
             ON CONFLICT (alias_user_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
            [caller, target]
          );
        }
        await client.query('COMMIT');
        return { ok: true, userId: target };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
