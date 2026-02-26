-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentReference" TEXT,
ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';
