-- The student's profile card, moved out of localStorage and onto the account.
--
-- Every column is nullable with no default: an existing account keeps working
-- untouched, and the page treats NULL as "not filled in yet" rather than
-- backfilling a placeholder that would look like real data.
--
-- avatar is TEXT rather than a bounded VARCHAR because it holds a data URL.
-- The browser downscales the image to 256px before upload and the API refuses
-- anything over 512 KB, so the column is bounded in practice by the API rather
-- than by the type.

ALTER TABLE "users"
  ADD COLUMN "bio"            VARCHAR(280),
  ADD COLUMN "avatar"         TEXT,
  ADD COLUMN "student_number" VARCHAR(32),
  ADD COLUMN "degree"         VARCHAR(120),
  ADD COLUMN "year_of_study"  VARCHAR(32);
