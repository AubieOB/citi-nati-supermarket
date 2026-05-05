-- AlterTable: Add stock override fields to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "overrideActive"    BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "overrideStock"     INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "overrideReason"    TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "overrideUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "overrideUpdatedBy" TEXT;
