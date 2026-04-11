-- Persist location assignment for suppliers and supplier transactions.
-- This aligns the DB schema with existing controller/service logic that expects locationId.

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "location_id" INTEGER;

CREATE INDEX IF NOT EXISTS "suppliers_location_id_idx"
  ON "suppliers"("location_id");

ALTER TABLE "supplier_transactions"
  ADD COLUMN IF NOT EXISTS "location_id" INTEGER;

CREATE INDEX IF NOT EXISTS "supplier_transactions_location_id_idx"
  ON "supplier_transactions"("location_id");
