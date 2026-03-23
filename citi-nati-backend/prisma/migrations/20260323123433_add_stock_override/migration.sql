-- AlterTable: Add stock override fields to Product
ALTER TABLE "Product" ADD COLUMN "overrideActive"    BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "overrideStock"     INTEGER;
ALTER TABLE "Product" ADD COLUMN "overrideReason"    TEXT;
ALTER TABLE "Product" ADD COLUMN "overrideUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "overrideUpdatedBy" TEXT;
