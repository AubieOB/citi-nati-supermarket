-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS     "hideFromProductsPage" BOOLEAN NOT NULL DEFAULT false;
