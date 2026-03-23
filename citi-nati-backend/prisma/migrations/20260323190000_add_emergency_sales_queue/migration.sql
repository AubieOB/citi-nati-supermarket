-- CreateTable
CREATE TABLE "emergency_sales" (
    "id" SERIAL NOT NULL,
    "sale_ref" TEXT NOT NULL,
    "cashier_id" TEXT,
    "cashier_name" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "tendered_amount" DOUBLE PRECISION NOT NULL,
    "change_amount" DOUBLE PRECISION NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'CASH',
    "sync_status" TEXT NOT NULL DEFAULT 'pending_pos_sync',
    "pos_invoice_no" TEXT,
    "synced_at" TIMESTAMP(3),
    "last_sync_attempt_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "sync_error" TEXT,
    "cart_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_sale_items" (
    "id" SERIAL NOT NULL,
    "emergency_sale_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "product_code" TEXT NOT NULL,
    "barcode" TEXT,
    "product_name" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emergency_sales_sale_ref_key" ON "emergency_sales"("sale_ref");

-- CreateIndex
CREATE INDEX "emergency_sales_sync_status_created_at_idx" ON "emergency_sales"("sync_status", "created_at");

-- CreateIndex
CREATE INDEX "emergency_sales_retry_count_sync_status_idx" ON "emergency_sales"("retry_count", "sync_status");

-- CreateIndex
CREATE INDEX "emergency_sale_items_emergency_sale_id_idx" ON "emergency_sale_items"("emergency_sale_id");

-- CreateIndex
CREATE INDEX "emergency_sale_items_product_id_idx" ON "emergency_sale_items"("product_id");

-- AddForeignKey
ALTER TABLE "emergency_sale_items" ADD CONSTRAINT "emergency_sale_items_emergency_sale_id_fkey" FOREIGN KEY ("emergency_sale_id") REFERENCES "emergency_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_sale_items" ADD CONSTRAINT "emergency_sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
