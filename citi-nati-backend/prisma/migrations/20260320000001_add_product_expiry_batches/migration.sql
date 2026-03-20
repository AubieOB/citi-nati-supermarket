-- AlterTable: add expiryBatchCount to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "expiryBatchCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: ProductExpiryBatch
CREATE TABLE IF NOT EXISTS "ProductExpiryBatch" (
    "id"           SERIAL PRIMARY KEY,
    "productCode"  TEXT        NOT NULL,
    "expiryDate"   TIMESTAMP(3) NOT NULL,
    "remainingQty" DOUBLE PRECISION NOT NULL,
    "locationCode" TEXT,
    "batchNo"      TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductExpiryBatch_productCode_idx" ON "ProductExpiryBatch"("productCode");
CREATE INDEX IF NOT EXISTS "ProductExpiryBatch_expiryDate_idx" ON "ProductExpiryBatch"("expiryDate");

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductExpiryBatch_productCode_expiryDate_locationCode_batchNo_key"
    ON "ProductExpiryBatch"("productCode", "expiryDate", "locationCode", "batchNo");
