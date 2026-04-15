-- Branch-scoped promotion identity to prevent cross-branch promotion state collisions.
ALTER TABLE "Promotion"
ADD COLUMN IF NOT EXISTS "branch_code" TEXT;

UPDATE "Promotion"
SET "branch_code" = 'BLANTYRE'
WHERE "branch_code" IS NULL OR BTRIM("branch_code") = '';

ALTER TABLE "Promotion"
ALTER COLUMN "branch_code" SET NOT NULL;

DROP INDEX IF EXISTS "Promotion_type_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Promotion_branch_code_type_key"
ON "Promotion"("branch_code", "type");
