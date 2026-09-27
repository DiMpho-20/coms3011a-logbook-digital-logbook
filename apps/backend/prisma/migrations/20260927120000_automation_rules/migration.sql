-- US26 — Entry Automation Rules.
--
-- One table and one enum. Conditions and action are JSONB whose shape is
-- enforced by Zod on write and re-validated against the project on read, so
-- nothing here is ever executed as code.

DO $$
BEGIN
  CREATE TYPE "AutomationTrigger" AS ENUM ('ENTRY_CREATED', 'ENTRY_UPDATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id"         UUID NOT NULL,
  "user_id"    UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name"       VARCHAR(100) NOT NULL,
  "trigger"    "AutomationTrigger" NOT NULL,
  "conditions" JSONB NOT NULL,
  "action"     JSONB NOT NULL,
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- Two rules with the same name in one project would be indistinguishable in
-- the list, which matters more here than usual: US16 already shipped a real
-- duplicate-name ambiguity with custom fields.
CREATE UNIQUE INDEX IF NOT EXISTS "automation_rules_project_id_name_key"
  ON "automation_rules" ("project_id", "name");

-- Every entry save reads exactly this: the enabled rules of one project.
CREATE INDEX IF NOT EXISTS "automation_rules_project_id_enabled_idx"
  ON "automation_rules" ("project_id", "enabled");

DO $$
BEGIN
  ALTER TABLE "automation_rules"
    ADD CONSTRAINT "automation_rules_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "automation_rules"
    ADD CONSTRAINT "automation_rules_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
