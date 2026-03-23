-- AlterTable: add per-product low stock threshold
ALTER TABLE "Product"
ADD COLUMN "low_stock_threshold" INTEGER;
