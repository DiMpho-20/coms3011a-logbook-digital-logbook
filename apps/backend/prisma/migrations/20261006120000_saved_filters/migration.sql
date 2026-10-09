-- Saved Entries-page filters, moved from the browser to the account so they
-- follow the student between devices. Additive only.
CREATE TABLE IF NOT EXISTS "saved_filters" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "filters" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "saved_filters_user_id_idx" ON "saved_filters"("user_id");

DO $$ BEGIN
  ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
