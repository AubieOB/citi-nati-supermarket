-- Backfill locationCode for existing products
-- Blantyre products get location_code='BT' (default/legacy)
-- Zomba products get location_code='SH' (default operational location, will be re-synced with correct locations)
-- This ensures existing products can be found by findFirst queries

UPDATE "Product"
SET "location_code" = 'BT'
WHERE "branch_code" = 'BLANTYRE' AND "location_code" IS NULL;

UPDATE "Product"
SET "location_code" = 'SH'
WHERE "branch_code" = 'ZOMBA' AND "location_code" IS NULL;

-- For other branches (if any), default to their branch code as location
UPDATE "Product"
SET "location_code" = "branch_code"
WHERE "location_code" IS NULL;
