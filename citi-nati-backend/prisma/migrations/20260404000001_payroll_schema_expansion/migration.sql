-- ============================================================
-- Migration: payroll_schema_expansion
-- Adds missing columns and new tables introduced by the expanded
-- payroll module that were not included in the initial
-- business_operations_foundation migration.
-- All changes use conditional DDL to be safe for production.
-- ============================================================

-- ============================================================
-- 1. payroll_periods — add missing columns
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_periods' AND column_name = 'location_id') THEN
    ALTER TABLE "payroll_periods" ADD COLUMN "location_id" INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_periods' AND column_name = 'payroll_month') THEN
    ALTER TABLE "payroll_periods" ADD COLUMN "payroll_month" INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_periods' AND column_name = 'payroll_year') THEN
    ALTER TABLE "payroll_periods" ADD COLUMN "payroll_year" INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_periods' AND column_name = 'payroll_position_in_month') THEN
    ALTER TABLE "payroll_periods" ADD COLUMN "payroll_position_in_month" INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_periods' AND column_name = 'run_started_at') THEN
    ALTER TABLE "payroll_periods" ADD COLUMN "run_started_at" TIMESTAMP(3);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_periods' AND column_name = 'finalized_at') THEN
    ALTER TABLE "payroll_periods" ADD COLUMN "finalized_at" TIMESTAMP(3);
  END IF;
END $$;

-- payroll_periods — missing indexes
CREATE INDEX IF NOT EXISTS "payroll_periods_location_id_idx"
  ON "payroll_periods"("location_id");

CREATE INDEX IF NOT EXISTS "payroll_periods_payroll_year_payroll_month_idx"
  ON "payroll_periods"("payroll_year", "payroll_month");

-- ============================================================
-- 2. payroll_entries — add missing columns
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'overtime_normal_hours') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "overtime_normal_hours" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'overtime_double_hours') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "overtime_double_hours" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'overtime_normal_amount') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "overtime_normal_amount" DOUBLE PRECISION DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'overtime_double_amount') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "overtime_double_amount" DOUBLE PRECISION DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'absence_deduction_amount') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "absence_deduction_amount" DOUBLE PRECISION DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'loan_balance_at_payroll') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "loan_balance_at_payroll" DOUBLE PRECISION DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'accrued_interest_at_payroll') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "accrued_interest_at_payroll" DOUBLE PRECISION DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'net_pay_mid_portion') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "net_pay_mid_portion" DOUBLE PRECISION DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_entries' AND column_name = 'net_pay_end_portion') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN "net_pay_end_portion" DOUBLE PRECISION DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- 3. employee_terminations — add missing columns
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'termination_type') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "termination_type" TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'half_pay_due_in_termination_month') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "half_pay_due_in_termination_month" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'amount_paid_in_termination_month') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "amount_paid_in_termination_month" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'leave_pay_accrued_days') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "leave_pay_accrued_days" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'leave_pay_amount') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "leave_pay_amount" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'outstanding_loan_obligations') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "outstanding_loan_obligations" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'gross_settlement_amount') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "gross_settlement_amount" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_terminations' AND column_name = 'net_settlement_amount') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN "net_settlement_amount" DOUBLE PRECISION;
  END IF;
END $$;

-- ============================================================
-- 4. employee_reengagements — add missing columns and FK
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_reengagements' AND column_name = 'wage_at_retrenchment') THEN
    ALTER TABLE "employee_reengagements" ADD COLUMN "wage_at_retrenchment" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_reengagements' AND column_name = 'linked_termination_id') THEN
    ALTER TABLE "employee_reengagements" ADD COLUMN "linked_termination_id" INTEGER;
  END IF;
END $$;

-- Add FK constraint for linked_termination_id (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'employee_reengagements'
      AND kcu.column_name = 'linked_termination_id'
  ) THEN
    ALTER TABLE "employee_reengagements"
      ADD CONSTRAINT "employee_reengagements_linked_termination_id_fkey"
      FOREIGN KEY ("linked_termination_id")
      REFERENCES "employee_terminations"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "employee_reengagements_linked_termination_id_idx"
  ON "employee_reengagements"("linked_termination_id");

-- ============================================================
-- 5. payroll_tax_brackets — create table if not exists
-- ============================================================
CREATE TABLE IF NOT EXISTS "payroll_tax_brackets" (
  "id"               SERIAL         NOT NULL,
  "location_id"      INTEGER,
  "effective_from"   TIMESTAMP(3)   NOT NULL,
  "effective_to"     TIMESTAMP(3),
  "min_income"       DOUBLE PRECISION NOT NULL,
  "max_income"       DOUBLE PRECISION,
  "rate_percent"     DOUBLE PRECISION NOT NULL,
  "fixed_tax_amount" DOUBLE PRECISION,
  "description"      TEXT,
  "is_active"        BOOLEAN        NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_tax_brackets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_tax_brackets_location_id_effective_from_idx"
  ON "payroll_tax_brackets"("location_id", "effective_from");

CREATE INDEX IF NOT EXISTS "payroll_tax_brackets_is_active_effective_from_idx"
  ON "payroll_tax_brackets"("is_active", "effective_from");

-- ============================================================
-- 6. payroll_increment_policies — create table if not exists
-- ============================================================
CREATE TABLE IF NOT EXISTS "payroll_increment_policies" (
  "id"                  SERIAL         NOT NULL,
  "location_id"         INTEGER,
  "min_service_months"  INTEGER        NOT NULL,
  "max_service_months"  INTEGER,
  "increment_percent"   DOUBLE PRECISION,
  "increment_amount"    DOUBLE PRECISION,
  "effective_from"      TIMESTAMP(3)   NOT NULL,
  "effective_to"        TIMESTAMP(3),
  "notes"               TEXT,
  "is_active"           BOOLEAN        NOT NULL DEFAULT true,
  "created_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_increment_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_increment_policies_location_id_effective_from_idx"
  ON "payroll_increment_policies"("location_id", "effective_from");

CREATE INDEX IF NOT EXISTS "payroll_increment_policies_is_active_min_service_months_idx"
  ON "payroll_increment_policies"("is_active", "min_service_months");
