-- Add POS transfer tracking fields to goods_intakes
ALTER TABLE "goods_intakes" ADD COLUMN "pos_transfer_status" TEXT;
ALTER TABLE "goods_intakes" ADD COLUMN "pos_transfer_grn" TEXT;
ALTER TABLE "goods_intakes" ADD COLUMN "pos_transfer_at" TIMESTAMP(3);
ALTER TABLE "goods_intakes" ADD COLUMN "pos_transfer_location_code" TEXT;
