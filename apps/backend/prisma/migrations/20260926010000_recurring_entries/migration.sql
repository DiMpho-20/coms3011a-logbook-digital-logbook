-- US27: a rule holds the original entry's immutable template. Every generated
-- occurrence points back to that rule, so disabling it stops future inserts.
DO $$ BEGIN
  CREATE TYPE "RecurrencePattern" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "recurrence_rules" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "pattern" "RecurrencePattern" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "next_occurrence" TIMESTAMP(3) NOT NULL,
  "until" TIMESTAMP(3),
  "duration_minutes" INTEGER NOT NULL,
  "due_date_offset_days" INTEGER,
  "template_values" JSONB NOT NULL,
  "template_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "format_version_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "recurrence_rules_enabled_next_occurrence_idx"
  ON "recurrence_rules"("enabled", "next_occurrence");
DO $$ BEGIN
  ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "logbook_entries" ADD COLUMN IF NOT EXISTS "recurrence_rule_id" UUID;
DO $$ BEGIN
  ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_recurrence_rule_id_fkey"
    FOREIGN KEY ("recurrence_rule_id") REFERENCES "recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
