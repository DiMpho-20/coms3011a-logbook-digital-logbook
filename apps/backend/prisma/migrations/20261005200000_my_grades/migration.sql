-- FEAT-009 (My Grades): a student's modules and the assessments that make up
-- their marks. Purely additive — two enums, two new tables, their indexes and
-- foreign keys — so nothing already deployed reads or writes anything here.
-- Written to be safe to re-run, like the migrations before it.

DO $$ BEGIN
  CREATE TYPE "ModuleType" AS ENUM ('SEMESTER', 'FULL_YEAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssessmentDateKind" AS ENUM ('DUE', 'TEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "academic_modules" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "academic_year" INTEGER NOT NULL,
  "type" "ModuleType" NOT NULL,
  "semester" INTEGER,
  "semester1_weight" DECIMAL(5,2),
  "target_mark" DECIMAL(5,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "assessments" (
  "id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "section" INTEGER,
  "weight" DECIMAL(5,2) NOT NULL,
  "mark_obtained" DECIMAL(7,2),
  "mark_max" DECIMAL(7,2),
  "mark_percent" DECIMAL(5,2),
  "missed" BOOLEAN NOT NULL DEFAULT false,
  "date" DATE,
  "date_kind" "AssessmentDateKind",
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "academic_modules_user_id_academic_year_idx"
  ON "academic_modules"("user_id", "academic_year");

-- Repeating a module in a later year is a new row, not a clash.
CREATE UNIQUE INDEX IF NOT EXISTS "academic_modules_user_id_code_academic_year_key"
  ON "academic_modules"("user_id", "code", "academic_year");

CREATE INDEX IF NOT EXISTS "assessments_module_id_idx" ON "assessments"("module_id");

DO $$ BEGIN
  ALTER TABLE "academic_modules" ADD CONSTRAINT "academic_modules_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "assessments" ADD CONSTRAINT "assessments_module_id_fkey"
    FOREIGN KEY ("module_id") REFERENCES "academic_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
