-- Branch-scoped product identity to prevent cross-branch collisions
-- Products with the same sourceCode/barcode must coexist across branches.

-- Ensure required columns exist before creating indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Product'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'sourceCode'
    ) THEN
      ALTER TABLE "Product" ADD COLUMN "sourceCode" TEXT;
    END IF;
  END IF;
END $$;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "branch_code" TEXT;

UPDATE "Product"
SET "branch_code" = 'BLANTYRE'
WHERE "branch_code" IS NULL;

ALTER TABLE "Product"
ALTER COLUMN "branch_code" SET DEFAULT 'BLANTYRE';

ALTER TABLE "Product"
ALTER COLUMN "branch_code" SET NOT NULL;

DROP INDEX IF EXISTS "Product_sourceCode_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Product_branch_code_sourceCode_key"
ON "Product"("branch_code", "sourceCode");

CREATE INDEX IF NOT EXISTS "Product_branch_code_idx"
ON "Product"("branch_code");
