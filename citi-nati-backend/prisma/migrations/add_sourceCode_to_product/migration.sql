-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sourceCode" TEXT,
ADD COLUMN "description" TEXT DEFAULT '',
ADD COLUMN "barcode" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "category" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sourceCode_key" ON "Product"("sourceCode");
