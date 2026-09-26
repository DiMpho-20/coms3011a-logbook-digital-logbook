-- Custom statistics (US17): a named expression an owner saves against one of
-- their projects. Only the definition is stored — the value is recomputed
-- from current entries on every read, so the statistic never goes stale.

CREATE TABLE IF NOT EXISTS "custom_statistics" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "expression" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_statistics_pkey" PRIMARY KEY ("id")
);

-- One name per project. A project has a single owner, so this is also
-- uniqueness per owner without carrying a second column into the index.
CREATE UNIQUE INDEX IF NOT EXISTS "custom_statistics_project_id_name_key"
  ON "custom_statistics"("project_id", "name");

ALTER TABLE "custom_statistics" ADD CONSTRAINT "custom_statistics_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_statistics" ADD CONSTRAINT "custom_statistics_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
