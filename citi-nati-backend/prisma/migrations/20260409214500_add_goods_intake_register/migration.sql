CREATE TABLE "goods_intakes" (
  "id" SERIAL NOT NULL,
  "intake_ref" TEXT NOT NULL,
  "supplier_id" INTEGER,
  "manual_supplier_name" TEXT,
  "supplier_store_ref" TEXT,
  "purchase_date" TIMESTAMP(3) NOT NULL,
  "receipt_reference" TEXT,
  "location_id" INTEGER,
  "location_code" TEXT,
  "location_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "overall_notes" TEXT,
  "receipt_total_amount" DOUBLE PRECISION,
  "total_items" INTEGER NOT NULL DEFAULT 0,
  "total_quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_estimated_profit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "entered_by" TEXT,
  "finalized_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_intakes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_intake_items" (
  "id" SERIAL NOT NULL,
  "goods_intake_id" INTEGER NOT NULL,
  "line_no" INTEGER NOT NULL,
  "barcode" TEXT,
  "product_id" INTEGER,
  "product_name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "selling_price" DOUBLE PRECISION,
  "estimated_profit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "margin_percent" DOUBLE PRECISION,
  "expiry_date" TIMESTAMP(3),
  "batch_ref" TEXT,
  "line_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_intake_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "goods_intakes_intake_ref_key" ON "goods_intakes"("intake_ref");
CREATE INDEX IF NOT EXISTS "goods_intakes_status_purchase_date_idx" ON "goods_intakes"("status", "purchase_date");
CREATE INDEX IF NOT EXISTS "goods_intakes_supplier_id_purchase_date_idx" ON "goods_intakes"("supplier_id", "purchase_date");
CREATE INDEX IF NOT EXISTS "goods_intakes_location_id_purchase_date_idx" ON "goods_intakes"("location_id", "purchase_date");
CREATE INDEX IF NOT EXISTS "goods_intakes_purchase_date_idx" ON "goods_intakes"("purchase_date");

CREATE INDEX IF NOT EXISTS "goods_intake_items_goods_intake_id_line_no_idx" ON "goods_intake_items"("goods_intake_id", "line_no");
CREATE INDEX IF NOT EXISTS "goods_intake_items_barcode_idx" ON "goods_intake_items"("barcode");
CREATE INDEX IF NOT EXISTS "goods_intake_items_product_id_idx" ON "goods_intake_items"("product_id");
CREATE INDEX IF NOT EXISTS "goods_intake_items_expiry_date_idx" ON "goods_intake_items"("expiry_date");

ALTER TABLE "goods_intakes"
ADD CONSTRAINT "goods_intakes_supplier_id_fkey"
FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goods_intake_items"
ADD CONSTRAINT "goods_intake_items_goods_intake_id_fkey"
FOREIGN KEY ("goods_intake_id") REFERENCES "goods_intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goods_intake_items"
ADD CONSTRAINT "goods_intake_items_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
