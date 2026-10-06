BEGIN;

-- A verified e-mail owns one account (user_id). Several e-mails may belong to the same account.
CREATE TABLE user_emails (
    email TEXT PRIMARY KEY CHECK (email = lower(email) AND length(email) <= 254),
    user_id UUID NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_emails_user_id_idx ON user_emails(user_id);

-- When an anonymous profile signs in to an existing account its characters move to that account and
-- its old id becomes an alias, so a browser that still holds the old cookie keeps working.
-- Aliases are always flattened: user_id is never itself an alias.
CREATE TABLE user_aliases (
    alias_user_id UUID PRIMARY KEY,
    user_id UUID NOT NULL CHECK (user_id <> alias_user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_aliases_user_id_idx ON user_aliases(user_id);

-- One-time sign-in codes. A code is bound to the browser identity that asked for it.
CREATE TABLE email_login_codes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL CHECK (email = lower(email)),
    anon_user_id UUID NOT NULL,
    code_hash TEXT NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL
);

CREATE INDEX email_login_codes_email_created_idx
    ON email_login_codes(email, created_at DESC);

COMMIT;
