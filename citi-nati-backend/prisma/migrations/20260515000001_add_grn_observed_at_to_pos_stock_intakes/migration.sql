-- Add a first-observed timestamp for POS GRNs so intake rows can show a useful local transaction time.
ALTER TABLE "pos_stock_intakes"
ADD COLUMN IF NOT EXISTS "grn_observed_at" TIMESTAMP(3);
