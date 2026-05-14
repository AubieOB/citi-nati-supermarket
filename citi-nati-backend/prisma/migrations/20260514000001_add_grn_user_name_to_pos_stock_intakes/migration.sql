-- Add missing user field for POS GRN reporting
ALTER TABLE "pos_stock_intakes"
ADD COLUMN IF NOT EXISTS "grn_user_name" TEXT;
