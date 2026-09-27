-- US19: dashboard layouts saved on the server, so they follow the student
-- to every browser and device.

CREATE TABLE IF NOT EXISTS "dashboard_layouts" (
  "user_id" UUID NOT NULL,
  "panels" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("user_id")
);

DO $$ BEGIN
  ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
