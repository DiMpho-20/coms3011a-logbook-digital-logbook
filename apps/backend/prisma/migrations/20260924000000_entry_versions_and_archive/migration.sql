-- US30: archiving an entry hides it from the active logbook without deleting it.
ALTER TABLE "logbook_entries" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- US20-22: every saved state of an entry, so edits never overwrite history.
CREATE TABLE IF NOT EXISTS "entry_versions" (
  "id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "reason" VARCHAR(20) NOT NULL,
  "restored_from_version" INTEGER,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "entry_versions_entry_id_version_key" ON "entry_versions"("entry_id", "version");

DO $$ BEGIN
  ALTER TABLE "entry_versions" ADD CONSTRAINT "entry_versions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
