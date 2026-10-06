BEGIN;

-- E-mail given on the landing page when pressing "Play". Not verified, so it is only a contact: it never
-- signs anyone in or merges accounts (that stays with the verified user_emails), but anyone else who then
-- gives the same address must prove it with a code. Verifying it makes the verifier its owner.
CREATE TABLE user_contact_emails (
    user_id UUID NOT NULL,
    email TEXT NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, email)
);

CREATE INDEX user_contact_emails_email_idx ON user_contact_emails(email);

COMMIT;
