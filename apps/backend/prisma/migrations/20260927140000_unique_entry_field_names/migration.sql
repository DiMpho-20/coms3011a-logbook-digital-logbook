-- One field name per project.
--
-- Duplicate names were allowed, and the consequence stopped being cosmetic once
-- two features started reading fields by name: a US16 expression such as
-- SUM({Double hours}) is refused as ambiguous, so the field becomes unusable in
-- statistics, and a US26 rule builder shows two identically-labelled options
-- the user cannot tell apart. Entries also render the field twice.
--
-- Comparison is case-insensitive, because "Hours" and "hours" are the same
-- field to everyone except a byte comparison, and it applies only to live
-- fields: archiving a field must release its name for reuse.

-- --------------------------------------------------------------------------
-- 1. Resolve the duplicates that already exist, or the index cannot be built.
-- --------------------------------------------------------------------------
-- The oldest field keeps the name; later ones get a numeric suffix. Renaming
-- rather than archiving is deliberate — archiving would drop the field out of
-- the active format and hide data that entries have already recorded against
-- it, which is a much larger change than the problem warrants.
--
-- The loop exists because a generated name can itself collide with a name
-- already in use (a project with "Hours", "Hours" and "Hours (2)"). Each pass
-- makes strictly more names distinct, so it settles; the counter is a guard
-- against a pathological case spinning rather than an expected path.
DO $$
DECLARE
  renamed INT;
  passes  INT := 0;
BEGIN
  LOOP
    WITH ranked AS (
      SELECT "id",
             "name",
             ROW_NUMBER() OVER (
               PARTITION BY "project_id", lower("name")
               ORDER BY "created_at", "id"
             ) AS rn
        FROM "entry_fields"
       WHERE "archived_at" IS NULL
    )
    UPDATE "entry_fields" AS f
       -- Truncated so the suffix cannot push the value past VARCHAR(255).
       SET "name" = left(ranked."name", 245) || ' (' || ranked.rn || ')'
      FROM ranked
     WHERE f."id" = ranked."id"
       AND ranked.rn > 1;

    GET DIAGNOSTICS renamed = ROW_COUNT;
    passes := passes + 1;

    EXIT WHEN renamed = 0;

    IF passes > 10 THEN
      RAISE EXCEPTION 'Could not settle duplicate entry field names after % passes', passes;
    END IF;
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 2. Stop it happening again.
-- --------------------------------------------------------------------------
-- A partial, functional unique index: Prisma's schema language cannot express
-- either lower() or the WHERE clause, so this index is declared here and not in
-- schema.prisma. `migrate deploy` applies it and leaves it alone; a future
-- `migrate diff` will not know about it, which is noted beside the model.
--
-- The API checks the same rule first so the user gets a readable message, but
-- that check is a read followed by a write and races exactly the way BUG-001
-- did. This index is what actually makes the rule true.
CREATE UNIQUE INDEX IF NOT EXISTS "entry_fields_project_id_lower_name_key"
  ON "entry_fields" ("project_id", lower("name"))
  WHERE "archived_at" IS NULL;
