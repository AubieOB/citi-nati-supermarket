-- AlterTable: Add branch_code column to goods_intakes
ALTER TABLE "goods_intakes" ADD COLUMN "branch_code" TEXT;

-- CreateIndex: Branch + Location scope indexes for better query performance
CREATE INDEX "goods_intakes_branch_code_location_code_purchase_date_idx" ON "goods_intakes"("branch_code", "location_code", "purchase_date");

-- CreateIndex: Branch + Location + Status filter index
CREATE INDEX "goods_intakes_branch_code_location_code_status_purchase_date_idx" ON "goods_intakes"("branch_code", "location_code", "status", "purchase_date");
