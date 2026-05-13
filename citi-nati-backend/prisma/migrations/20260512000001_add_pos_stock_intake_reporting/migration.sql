-- CreateTable
CREATE TABLE "pos_stock_intakes" (
    "id" SERIAL NOT NULL,
    "sync_source_id" INTEGER NOT NULL,
    "branch_code" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "location_id" INTEGER,
    "location_code" TEXT,
    "sync_source_code" TEXT NOT NULL,
    "grn_no" TEXT NOT NULL,
    "grn_date" TIMESTAMP(3),
    "grn_reference" TEXT,
    "supplier_code" TEXT,
    "order_number" TEXT,
    "upload_status" INTEGER,
    "source_updated_at" TIMESTAMP(3),
    "source_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_stock_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_stock_intake_items" (
    "id" SERIAL NOT NULL,
    "pos_stock_intake_id" INTEGER NOT NULL,
    "sync_source_code" TEXT NOT NULL,
    "stock_detail_id" TEXT,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_cost" DOUBLE PRECISION,
    "line_amount" DOUBLE PRECISION,
    "expiry_date" TIMESTAMP(3),
    "upload_status" INTEGER,
    "source_updated_at" TIMESTAMP(3),
    "source_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_stock_intake_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_stock_intakes_sync_source_code_idx" ON "pos_stock_intakes"("sync_source_code");

-- CreateIndex
CREATE INDEX "pos_stock_intakes_grn_no_idx" ON "pos_stock_intakes"("grn_no");

-- CreateIndex
CREATE INDEX "pos_stock_intakes_branch_code_idx" ON "pos_stock_intakes"("branch_code");

-- CreateIndex
CREATE INDEX "pos_stock_intakes_grn_date_idx" ON "pos_stock_intakes"("grn_date");

-- CreateIndex
CREATE UNIQUE INDEX "pos_stock_intakes_sync_source_code_grn_no_key" ON "pos_stock_intakes"("sync_source_code", "grn_no");

-- CreateIndex
CREATE INDEX "pos_stock_intake_items_sync_source_code_idx" ON "pos_stock_intake_items"("sync_source_code");

-- CreateIndex
CREATE INDEX "pos_stock_intake_items_product_code_idx" ON "pos_stock_intake_items"("product_code");

-- CreateIndex
CREATE INDEX "pos_stock_intake_items_pos_stock_intake_id_idx" ON "pos_stock_intake_items"("pos_stock_intake_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_stock_intake_items_pos_stock_intake_id_stock_detail_id_key" ON "pos_stock_intake_items"("pos_stock_intake_id", "stock_detail_id");

-- AddForeignKey
ALTER TABLE "pos_stock_intakes" ADD CONSTRAINT "pos_stock_intakes_sync_source_id_fkey" FOREIGN KEY ("sync_source_id") REFERENCES "sales_sync_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_stock_intake_items" ADD CONSTRAINT "pos_stock_intake_items_pos_stock_intake_id_fkey" FOREIGN KEY ("pos_stock_intake_id") REFERENCES "pos_stock_intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

