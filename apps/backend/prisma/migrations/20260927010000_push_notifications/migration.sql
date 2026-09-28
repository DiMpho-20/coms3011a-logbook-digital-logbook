-- US28 follow-up: web push notifications for reminders.

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "pushed_at" TIMESTAMP(3);

-- Reminders that already exist count as announced, so the first run of the
-- push job doesn't send every old reminder at once.
UPDATE "reminders" SET "pushed_at" = CURRENT_TIMESTAMP WHERE "pushed_at" IS NULL;

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" VARCHAR(255) NOT NULL,
  "auth" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

DO $$ BEGIN
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
