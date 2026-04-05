-- Render safety backfill for payroll columns used by full workbook export/import.
-- This migration is idempotent and safe to run multiple times.

DO $$
BEGIN
  -- employee_loans
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_loans') THEN
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "loan_reference" TEXT;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "interest_rate" DOUBLE PRECISION;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "accrued_interest" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "loan_granted_month" INTEGER;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "loan_granted_year" INTEGER;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "repayment_end_month" INTEGER;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "repayment_end_year" INTEGER;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "reason" TEXT;
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP(3);
    ALTER TABLE "employee_loans" ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP(3);
  END IF;

  -- employee_terminations
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_terminations') THEN
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "termination_type" TEXT;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "reason" TEXT;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "days_worked_in_final_month" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "half_pay_received" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "settlement_amount" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "half_pay_due_in_termination_month" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "amount_paid_in_termination_month" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "leave_pay_accrued_days" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "leave_pay_amount" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "outstanding_loan_obligations" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "gross_settlement_amount" DOUBLE PRECISION;
    ALTER TABLE "employee_terminations" ADD COLUMN IF NOT EXISTS "net_settlement_amount" DOUBLE PRECISION;
  END IF;

  -- employee_reengagements
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_reengagements') THEN
    ALTER TABLE "employee_reengagements" ADD COLUMN IF NOT EXISTS "linked_termination_id" INTEGER;
    ALTER TABLE "employee_reengagements" ADD COLUMN IF NOT EXISTS "wage_at_retrenchment" DOUBLE PRECISION;
    ALTER TABLE "employee_reengagements" ADD COLUMN IF NOT EXISTS "previous_wage" DOUBLE PRECISION;
    ALTER TABLE "employee_reengagements" ADD COLUMN IF NOT EXISTS "reengagement_wage" DOUBLE PRECISION;
    ALTER TABLE "employee_reengagements" ADD COLUMN IF NOT EXISTS "occupation" TEXT;
    ALTER TABLE "employee_reengagements" ADD COLUMN IF NOT EXISTS "contract_expiry_date" TIMESTAMP(3);
  END IF;

  -- payroll_entries
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payroll_entries') THEN
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "overtime_normal_hours" DOUBLE PRECISION;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "overtime_double_hours" DOUBLE PRECISION;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "overtime_normal_amount" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "overtime_double_amount" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "absence_deduction_amount" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "loan_balance_at_payroll" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "accrued_interest_at_payroll" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "net_pay_mid_portion" DOUBLE PRECISION DEFAULT 0;
    ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "net_pay_end_portion" DOUBLE PRECISION DEFAULT 0;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "employee_loans_loan_reference_key"
  ON "employee_loans"("loan_reference");

CREATE INDEX IF NOT EXISTS "employee_loans_status_idx"
  ON "employee_loans"("status");

CREATE INDEX IF NOT EXISTS "employee_reengagements_linked_termination_id_idx"
  ON "employee_reengagements"("linked_termination_id");
