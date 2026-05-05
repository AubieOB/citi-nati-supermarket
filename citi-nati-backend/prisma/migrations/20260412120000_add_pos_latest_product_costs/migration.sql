-- CreateTable
CREATE TABLE "pos_latest_product_costs" (
    "id" SERIAL NOT NULL,
    "sync_source_id" INTEGER NOT NULL,
    "branch_code" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "location_id" INTEGER,
    "location_code" TEXT,
    "sync_source_code" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT,
    "latest_unit_cost" DOUBLE PRECISION,
    "latest_grn_no" TEXT,
    "latest_grn_reference" TEXT,
    "latest_grn_date" TIMESTAMP(3),
    "stock_detail_id" TEXT,
    "source_updated_at" TIMESTAMP(3),
    "source_synced_at" TIMESTAMP(3),
    "first_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_latest_product_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_latest_product_costs_sync_source_code_product_code_key" ON "pos_latest_product_costs"("sync_source_code", "product_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_latest_product_costs_sync_source_code_idx" ON "pos_latest_product_costs"("sync_source_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_latest_product_costs_product_code_idx" ON "pos_latest_product_costs"("product_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_latest_product_costs_branch_code_product_code_idx" ON "pos_latest_product_costs"("branch_code", "product_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_latest_product_costs_location_code_product_code_idx" ON "pos_latest_product_costs"("location_code", "product_code");

-- AddForeignKey
ALTER TABLE "pos_latest_product_costs"
ADD CONSTRAINT "pos_latest_product_costs_sync_source_id_fkey"
FOREIGN KEY ("sync_source_id") REFERENCES "sales_sync_sources"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
