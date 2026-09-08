-- Rich field types, soft-deleted fields, and immutable entry-format snapshots.
ALTER TYPE "EntryFieldType" ADD VALUE IF NOT EXISTS 'TAGS';
ALTER TYPE "EntryFieldType" ADD VALUE IF NOT EXISTS 'CHECKLIST';
ALTER TYPE "EntryFieldType" ADD VALUE IF NOT EXISTS 'LINK';
ALTER TYPE "EntryFieldType" ADD VALUE IF NOT EXISTS 'REFERENCE';
ALTER TYPE "EntryFieldType" ADD VALUE IF NOT EXISTS 'COMPUTED';

ALTER TABLE "entry_fields" ADD COLUMN IF NOT EXISTS "formula" TEXT;
ALTER TABLE "entry_fields" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "logbook_entries" ADD COLUMN IF NOT EXISTS "format_version_id" UUID;

CREATE TABLE IF NOT EXISTS "entry_format_versions" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "fields" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_format_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "entry_format_versions_project_id_version_key" ON "entry_format_versions"("project_id", "version");
ALTER TABLE "entry_format_versions" ADD CONSTRAINT "entry_format_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "logbook_entries" ADD CONSTRAINT "logbook_entries_format_version_id_fkey" FOREIGN KEY ("format_version_id") REFERENCES "entry_format_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
