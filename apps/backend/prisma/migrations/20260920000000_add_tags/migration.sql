-- Tags: a lightweight, user-scoped label attachable to both projects and
-- entries, independent of the per-project custom entry-field system.

CREATE TABLE IF NOT EXISTS "tags" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tags_user_id_name_key" ON "tags"("user_id", "name");
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "project_tags" (
  "project_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "project_tags_pkey" PRIMARY KEY ("project_id", "tag_id")
);
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "entry_tags" (
  "entry_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "entry_tags_pkey" PRIMARY KEY ("entry_id", "tag_id")
);
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
