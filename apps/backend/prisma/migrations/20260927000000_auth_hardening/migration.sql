-- Auth hardening: 2FA recovery codes, and single-use tokens stored as digests.
--
-- NOTE ON RE-RUNNING: the two UPDATE statements at the bottom are NOT
-- idempotent. A raw token and its SHA-256 digest are both 64 hex characters,
-- so there is no way to tell them apart after the fact and no guard that can
-- distinguish "already hashed" from "not yet hashed". Prisma applies a
-- migration exactly once, which is what makes this safe; do not replay this
-- file by hand against a database that has already had it applied, or every
-- outstanding token will be double-hashed and stop matching.

-- --------------------------------------------------------------------------
-- BUG-005: 2FA recovery codes
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "two_factor_recovery_codes" (
  "id"         UUID NOT NULL,
  "user_id"    UUID NOT NULL,
  "code_hash"  VARCHAR(64) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "two_factor_recovery_codes_user_id_code_hash_key"
  ON "two_factor_recovery_codes" ("user_id", "code_hash");

CREATE INDEX IF NOT EXISTS "two_factor_recovery_codes_user_id_idx"
  ON "two_factor_recovery_codes" ("user_id");

DO $$
BEGIN
  ALTER TABLE "two_factor_recovery_codes"
    ADD CONSTRAINT "two_factor_recovery_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- Single-use tokens: store the digest, not the credential
-- --------------------------------------------------------------------------
-- password_resets.token_hash was misnamed: it held the raw token, so read
-- access to this table was enough to complete a reset for any account with one
-- in flight. Same for users.email_verification_token.
--
-- Expired rows are cleared rather than converted — they can no longer be
-- redeemed, so there is nothing to preserve and less to rewrite.
DELETE FROM "password_resets" WHERE "expires_at" <= NOW();

UPDATE "users"
   SET "email_verification_token" = NULL,
       "email_verification_expiry" = NULL
 WHERE "email_verification_expiry" IS NOT NULL
   AND "email_verification_expiry" <= NOW();

-- Convert the still-live ones in place, so links already sitting in inboxes
-- keep working rather than failing for the next hour with no explanation.
UPDATE "password_resets"
   SET "token_hash" = encode(sha256(convert_to("token_hash", 'UTF8')), 'hex')
 WHERE "expires_at" > NOW();

UPDATE "users"
   SET "email_verification_token" = encode(sha256(convert_to("email_verification_token", 'UTF8')), 'hex')
 WHERE "email_verification_token" IS NOT NULL;
