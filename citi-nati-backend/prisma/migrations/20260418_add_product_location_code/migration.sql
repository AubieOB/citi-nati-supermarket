-- Add location_code field to Product table to store per-location product data
-- This allows Zomba to differentiate products by location: SH, BAR, ST999, WH
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "location_code" TEXT;

-- Drop existing unique constraint on branchCode + sourceCode
DROP INDEX IF EXISTS "Product_branchCode_sourceCode_key";

-- Create new unique constraint that includes locationCode
-- This allows same sourceCode to exist in different locations
CREATE UNIQUE INDEX "Product_branchCode_sourceCode_locationCode_key"
ON "Product"("branch_code", "sourceCode", "location_code");

-- Create additional index on location_code for filtering queries
CREATE INDEX IF NOT EXISTS "Product_location_code_idx"
ON "Product"("location_code");

-- Create composite index for common queries (branchCode + locationCode filtering)
CREATE INDEX IF NOT EXISTS "Product_branchCode_locationCode_idx"
ON "Product"("branch_code", "location_code");
