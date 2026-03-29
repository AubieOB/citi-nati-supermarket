-- Add supplemental indexes optimised for the Business Operations reporting API.
-- These complement the primary sync storage indexes from the previous migration.

-- sales_invoices: branch_code standalone (reporting filter without date range)
CREATE INDEX IF NOT EXISTS "sales_invoices_branch_code_idx"
  ON "sales_invoices"("branch_code");

-- sales_invoices: (sync_source_code, invoice_date) — most common reporting compound key
CREATE INDEX IF NOT EXISTS "sales_invoices_sync_source_code_invoice_date_idx"
  ON "sales_invoices"("sync_source_code", "invoice_date");

-- sales_invoices: pay_method_1 — groupBy for payment summary endpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_pay_method_1_idx"
  ON "sales_invoices"("pay_method_1");

-- sales_invoices: pay_method_2 — groupBy for payment summary endpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_pay_method_2_idx"
  ON "sales_invoices"("pay_method_2");

-- sales_invoices: invoice_type — filter for invoice type
CREATE INDEX IF NOT EXISTS "sales_invoices_invoice_type_idx"
  ON "sales_invoices"("invoice_type");

-- sales_invoice_items: (product_code, product_name) — groupBy for product report
CREATE INDEX IF NOT EXISTS "sales_invoice_items_product_code_product_name_idx"
  ON "sales_invoice_items"("product_code", "product_name");
