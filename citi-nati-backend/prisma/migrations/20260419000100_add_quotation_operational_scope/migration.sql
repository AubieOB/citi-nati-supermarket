-- Add operational location scope columns to quotations
ALTER TABLE "quotations"
  ADD COLUMN IF NOT EXISTS "branch_code" TEXT,
  ADD COLUMN IF NOT EXISTS "location_code" TEXT;

-- Backfill existing quotations to default operational scope
UPDATE "quotations"
SET
  "branch_code" = COALESCE(NULLIF(TRIM("branch_code"), ''), 'BLANTYRE'),
  "location_code" = COALESCE(NULLIF(TRIM("location_code"), ''), 'BT');

-- Enforce non-null moving forward
ALTER TABLE "quotations"
  ALTER COLUMN "branch_code" SET DEFAULT 'BLANTYRE',
  ALTER COLUMN "location_code" SET DEFAULT 'BT',
  ALTER COLUMN "branch_code" SET NOT NULL,
  ALTER COLUMN "location_code" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "quotations_branch_code_location_code_created_at_idx"
  ON "quotations"("branch_code", "location_code", "created_at");
