-- Minimal additive migration for Purchase Order Sheet fields
-- Replaces accidental baseline migration with a production-safe patch.
-- Creates only purchase_orders and purchase_order_items if missing.

BEGIN;

-- Ensure purchase_orders exists with the required minimum schema.
CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id" SERIAL PRIMARY KEY,
    "purchase_order_ref" TEXT NOT NULL,
    "supplier_id" INTEGER,
    "supplier_name" TEXT,
    "purchase_date" TIMESTAMPTZ NOT NULL,
    "expected_delivery_date" TIMESTAMPTZ,
    "location_id" INTEGER,
    "branch_code" TEXT,
    "location_code" TEXT,
    "location_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "total_quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entered_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure purchase_order_items exists with the required minimum schema.
CREATE TABLE IF NOT EXISTS "purchase_order_items" (
    "id" SERIAL PRIMARY KEY,
    "purchase_order_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "barcode" TEXT,
    "product_id" INTEGER,
    "product_name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shelf_balance" DOUBLE PRECISION DEFAULT 0,
    "pos_balance" DOUBLE PRECISION DEFAULT 0,
    "selling_price" DOUBLE PRECISION DEFAULT 0,
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiry_date" TIMESTAMPTZ,
    "batch_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add new columns to purchase_order_items if the table already exists.
ALTER TABLE IF EXISTS "purchase_order_items"
    ADD COLUMN IF NOT EXISTS "shelf_balance" DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pos_balance" DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "selling_price" DOUBLE PRECISION DEFAULT 0;

-- Add indexes only if missing.
CREATE INDEX IF NOT EXISTS "purchase_order_items_purchase_order_id_line_no_idx"
    ON "purchase_order_items" ("purchase_order_id", "line_no");
CREATE INDEX IF NOT EXISTS "purchase_order_items_barcode_idx"
    ON "purchase_order_items" ("barcode");
CREATE INDEX IF NOT EXISTS "purchase_order_items_product_id_idx"
    ON "purchase_order_items" ("product_id");

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_purchase_order_ref_key"
    ON "purchase_orders" ("purchase_order_ref");
CREATE INDEX IF NOT EXISTS "purchase_orders_status_purchase_date_idx"
    ON "purchase_orders" ("status", "purchase_date");
CREATE INDEX IF NOT EXISTS "purchase_orders_branch_code_location_code_purchase_date_idx"
    ON "purchase_orders" ("branch_code", "location_code", "purchase_date");

-- Add foreign key constraints if referenced tables exist.
DO $$
BEGIN
    IF to_regclass('purchase_orders') IS NOT NULL AND to_regclass('suppliers') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_supplier_id_fkey') THEN
            ALTER TABLE "purchase_orders"
                ADD CONSTRAINT "purchase_orders_supplier_id_fkey"
                FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
    END IF;

    IF to_regclass('purchase_order_items') IS NOT NULL AND to_regclass('purchase_orders') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_purchase_order_id_fkey') THEN
            ALTER TABLE "purchase_order_items"
                ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey"
                FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
    END IF;

    IF to_regclass('purchase_order_items') IS NOT NULL AND (to_regclass('Product') IS NOT NULL OR to_regclass('product') IS NOT NULL) THEN
        IF to_regclass('Product') IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_product_id_fkey') THEN
                ALTER TABLE "purchase_order_items"
                    ADD CONSTRAINT "purchase_order_items_product_id_fkey"
                    FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
        ELSIF to_regclass('product') IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_product_id_fkey') THEN
                ALTER TABLE "purchase_order_items"
                    ADD CONSTRAINT "purchase_order_items_product_id_fkey"
                    FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
        END IF;
    END IF;
END$$;

COMMIT;

-- End of minimal migration
