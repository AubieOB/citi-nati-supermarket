CREATE TABLE "sales_sync_sources" (
  "id" SERIAL NOT NULL,
  "branch_code" TEXT NOT NULL,
  "branch_name" TEXT NOT NULL,
  "location_id" INTEGER,
  "sync_source_code" TEXT NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_sync_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_sync_sources_sync_source_code_key" ON "sales_sync_sources"("sync_source_code");

CREATE TABLE "sales_invoices" (
  "id" BIGSERIAL NOT NULL,
  "sync_source_id" INTEGER NOT NULL,
  "branch_code" TEXT NOT NULL,
  "branch_name" TEXT NOT NULL,
  "location_id" INTEGER,
  "sync_source_code" TEXT NOT NULL,
  "source_invoice_no" INTEGER NOT NULL,
  "source_invoice_serial_no" INTEGER,
  "source_cash_sale_no" INTEGER,
  "ref_no" TEXT,
  "invoice_date" TIMESTAMP(3),
  "invoice_time" TIMESTAMP(3),
  "customer_code" TEXT,
  "customer_details" TEXT,
  "location_code" TEXT,
  "gross_sale" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vat_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "net_sale" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "invoice_type" TEXT,
  "till_id" INTEGER,
  "pay_method_1" TEXT,
  "tender_amount_1" DOUBLE PRECISION,
  "chq_no_1" TEXT,
  "pay_method_2" TEXT,
  "tender_amount_2" DOUBLE PRECISION,
  "chq_no_2" TEXT,
  "user_name" TEXT,
  "price_type_code" TEXT,
  "rep_code" TEXT,
  "upload_status" INTEGER,
  "levy_amount" DOUBLE PRECISION,
  "reserved" INTEGER,
  "discount_amount" DOUBLE PRECISION,
  "fiscal_receipt_no" TEXT,
  "bank_code" TEXT,
  "bank_name" TEXT,
  "bank_card_holder" TEXT,
  "bank_card_no" TEXT,
  "bank_card_expiry" TEXT,
  "quote_no" TEXT,
  "source_synced_at" TIMESTAMP(3),
  "first_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales_invoices"
  ADD CONSTRAINT "sales_invoices_sync_source_id_fkey"
  FOREIGN KEY ("sync_source_id") REFERENCES "sales_sync_sources"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_sync_source_code_source_invoice_no_key"
  ON "sales_invoices"("sync_source_code", "source_invoice_no");

CREATE INDEX IF NOT EXISTS "sales_invoices_sync_source_code_idx" ON "sales_invoices"("sync_source_code");
CREATE INDEX IF NOT EXISTS "sales_invoices_source_invoice_no_idx" ON "sales_invoices"("source_invoice_no");
CREATE INDEX IF NOT EXISTS "sales_invoices_invoice_date_idx" ON "sales_invoices"("invoice_date");
CREATE INDEX IF NOT EXISTS "sales_invoices_user_name_idx" ON "sales_invoices"("user_name");
CREATE INDEX IF NOT EXISTS "sales_invoices_location_code_idx" ON "sales_invoices"("location_code");
CREATE INDEX IF NOT EXISTS "sales_invoices_branch_code_invoice_date_idx" ON "sales_invoices"("branch_code", "invoice_date");

CREATE TABLE "sales_invoice_items" (
  "id" BIGSERIAL NOT NULL,
  "sales_invoice_id" BIGINT NOT NULL,
  "sync_source_code" TEXT NOT NULL,
  "source_inv_detail_id" INTEGER NOT NULL,
  "source_invoice_code" INTEGER,
  "product_code" TEXT,
  "product_name" TEXT,
  "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "price_type_code" TEXT,
  "unit_price" DOUBLE PRECISION,
  "bulk_price" DOUBLE PRECISION,
  "discount" DOUBLE PRECISION,
  "amount" DOUBLE PRECISION,
  "start_serial_no" TEXT,
  "end_serial_no" TEXT,
  "tax_rate" DOUBLE PRECISION,
  "tax_amount" DOUBLE PRECISION,
  "f_price" DOUBLE PRECISION,
  "upload_status" INTEGER,
  "location_code" TEXT,
  "levy_rate" DOUBLE PRECISION,
  "levy_amount" DOUBLE PRECISION,
  "printed" INTEGER,
  "sub_qty" DOUBLE PRECISION,
  "discount_amount" DOUBLE PRECISION,
  "cost_price" DOUBLE PRECISION,
  "grn_date" TIMESTAMP(3),
  "first_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales_invoice_items"
  ADD CONSTRAINT "sales_invoice_items_sales_invoice_id_fkey"
  FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoice_items_sync_source_code_source_inv_detail_id_key"
  ON "sales_invoice_items"("sync_source_code", "source_inv_detail_id");

CREATE INDEX IF NOT EXISTS "sales_invoice_items_sync_source_code_idx" ON "sales_invoice_items"("sync_source_code");
CREATE INDEX IF NOT EXISTS "sales_invoice_items_source_inv_detail_id_idx" ON "sales_invoice_items"("source_inv_detail_id");
CREATE INDEX IF NOT EXISTS "sales_invoice_items_product_code_idx" ON "sales_invoice_items"("product_code");
CREATE INDEX IF NOT EXISTS "sales_invoice_items_location_code_idx" ON "sales_invoice_items"("location_code");
CREATE INDEX IF NOT EXISTS "sales_invoice_items_sales_invoice_id_idx" ON "sales_invoice_items"("sales_invoice_id");
