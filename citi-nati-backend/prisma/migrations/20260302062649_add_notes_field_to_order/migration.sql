-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "stock" SET DEFAULT 0;
