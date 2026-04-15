-- Branch-scoped product identity to prevent cross-branch collisions
-- Products with the same sourceCode/barcode must coexist across branches.

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
