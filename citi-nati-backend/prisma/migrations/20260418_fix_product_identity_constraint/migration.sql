-- Fix Product identity uniqueness for multi-location operational sync.
-- Problem: legacy unique index on (branch_code, sourceCode) blocks Zomba products
-- when the same ProductCode exists across SH/BAR/ST999.

-- Drop legacy/incorrect unique indexes (all known historical variants).
DROP INDEX IF EXISTS "Product_sourceCode_key";
DROP INDEX IF EXISTS "Product_branch_code_sourceCode_key";
DROP INDEX IF EXISTS "Product_branchCode_sourceCode_key";
DROP INDEX IF EXISTS "Product_branchCode_sourceCode_locationCode_key";
DROP INDEX IF EXISTS "Product_branch_code_sourceCode_location_code_key";

-- Canonical product identity for POS-synced rows:
-- branch_code + location_code + sourceCode (sourceCode is POS ProductCode in this model).
CREATE UNIQUE INDEX IF NOT EXISTS "Product_branch_code_location_code_sourceCode_key"
ON "Product"("branch_code", "location_code", "sourceCode");

-- Supporting indexes for scoped reads.
CREATE INDEX IF NOT EXISTS "Product_branch_code_location_code_idx"
ON "Product"("branch_code", "location_code");

CREATE INDEX IF NOT EXISTS "Product_location_code_idx"
ON "Product"("location_code");
