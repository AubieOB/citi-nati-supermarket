-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS     "notes" TEXT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "stock" SET DEFAULT 0;
