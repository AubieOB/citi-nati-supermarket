-- Add order pricing breakdown fields for delivery fee-aware totals
ALTER TABLE "Order"
  ADD COLUMN "subtotal_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_fee_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "final_total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing orders so legacy records keep coherent totals
UPDATE "Order"
SET
  "subtotal_amount" = COALESCE("total", 0),
  "delivery_fee_amount" = 0,
  "final_total_amount" = COALESCE("total", 0)
WHERE "final_total_amount" = 0;
