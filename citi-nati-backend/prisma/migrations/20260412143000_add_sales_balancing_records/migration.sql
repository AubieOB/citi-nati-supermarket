-- CreateTable
CREATE TABLE "sales_balancing_records" (
    "id" SERIAL NOT NULL,
    "balancing_date" TIMESTAMP(3) NOT NULL,
    "location_id" INTEGER NOT NULL,
    "location_code" TEXT,
    "location_name" TEXT,
    "reference_title" TEXT,
    "cashier_reference" TEXT,
    "shift_reference" TEXT,
    "prepared_by" TEXT,
    "notes" TEXT,
    "expected_system_sales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cash_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airtel_money_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tnm_mpamba_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pos_card_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank_transfer_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_actual_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difference_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "result_status" TEXT NOT NULL DEFAULT 'balanced',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_balancing_records_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "sales_balancing_records_location_id_balancing_date_idx" ON "sales_balancing_records"("location_id", "balancing_date");
CREATE INDEX IF NOT EXISTS "sales_balancing_records_status_balancing_date_idx" ON "sales_balancing_records"("status", "balancing_date");
CREATE INDEX IF NOT EXISTS "sales_balancing_records_location_code_balancing_date_idx" ON "sales_balancing_records"("location_code", "balancing_date");

-- Optional guardrails for amounts/status
ALTER TABLE "sales_balancing_records"
  ADD CONSTRAINT "sales_balancing_records_non_negative_amounts_chk"
  CHECK (
    "expected_system_sales" >= 0 AND
    "cash_amount" >= 0 AND
    "airtel_money_amount" >= 0 AND
    "tnm_mpamba_amount" >= 0 AND
    "pos_card_amount" >= 0 AND
    "bank_transfer_amount" >= 0 AND
    "other_amount" >= 0 AND
    "total_actual_amount" >= 0
  );

ALTER TABLE "sales_balancing_records"
  ADD CONSTRAINT "sales_balancing_records_status_chk"
  CHECK ("status" IN ('draft', 'finalized'));

ALTER TABLE "sales_balancing_records"
  ADD CONSTRAINT "sales_balancing_records_result_status_chk"
  CHECK ("result_status" IN ('balanced', 'shortage', 'overage'));
