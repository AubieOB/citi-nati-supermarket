-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS     "paymentReference" TEXT,
ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';
