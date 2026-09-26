-- US28: reminders, set by hand or generated from the student's reminder rules.

DO $$ BEGIN
  CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReminderSource" AS ENUM ('MANUAL', 'DUE_SOON', 'OVERDUE', 'STALE', 'DAILY_LOG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "reminders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "entry_id" UUID,
  "source" "ReminderSource" NOT NULL DEFAULT 'MANUAL',
  "rule_key" VARCHAR(255),
  "title" VARCHAR(255) NOT NULL,
  "note" TEXT,
  "remind_at" TIMESTAMP(3) NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  "completed_at" TIMESTAMP(3),
  "dismissed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reminders_user_id_rule_key_key" ON "reminders"("user_id", "rule_key");
CREATE INDEX IF NOT EXISTS "reminders_user_id_status_remind_at_idx" ON "reminders"("user_id", "status", "remind_at");

DO $$ BEGIN
  ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reminders" ADD CONSTRAINT "reminders_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "reminder_settings" (
  "user_id" UUID NOT NULL,
  "due_soon_enabled" BOOLEAN NOT NULL DEFAULT true,
  "due_soon_days" INTEGER NOT NULL DEFAULT 1,
  "overdue_enabled" BOOLEAN NOT NULL DEFAULT true,
  "stale_enabled" BOOLEAN NOT NULL DEFAULT false,
  "stale_days" INTEGER NOT NULL DEFAULT 7,
  "daily_log_enabled" BOOLEAN NOT NULL DEFAULT false,
  "daily_log_time" VARCHAR(5) NOT NULL DEFAULT '18:00',
  "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("user_id")
);

DO $$ BEGIN
  ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
