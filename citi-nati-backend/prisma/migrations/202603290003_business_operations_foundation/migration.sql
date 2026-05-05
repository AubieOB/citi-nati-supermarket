CREATE TABLE "suppliers" (
  "id" SERIAL NOT NULL,
  "supplier_code" TEXT,
  "name" TEXT NOT NULL,
  "contact_person" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "opening_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_supplier_code_key" ON "suppliers"("supplier_code");
CREATE INDEX IF NOT EXISTS "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX IF NOT EXISTS "suppliers_status_idx" ON "suppliers"("status");

CREATE TABLE "supplier_transactions" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "reporting_period_id" INTEGER,
  "transaction_date" TIMESTAMP(3) NOT NULL,
  "transaction_type" TEXT NOT NULL,
  "payment_method" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "reference_no" TEXT,
  "entered_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_transactions"
  ADD CONSTRAINT "supplier_transactions_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "supplier_transactions_supplier_id_transaction_date_idx"
  ON "supplier_transactions"("supplier_id", "transaction_date");
CREATE INDEX IF NOT EXISTS "supplier_transactions_reporting_period_id_idx"
  ON "supplier_transactions"("reporting_period_id");
CREATE INDEX IF NOT EXISTS "supplier_transactions_transaction_type_idx"
  ON "supplier_transactions"("transaction_type");

CREATE TABLE "supplier_balances" (
  "id" SERIAL NOT NULL,
  "supplier_id" INTEGER NOT NULL,
  "reporting_period_id" INTEGER NOT NULL,
  "total_debt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "outstanding_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_balances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_balances"
  ADD CONSTRAINT "supplier_balances_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_balances_supplier_id_reporting_period_id_key"
  ON "supplier_balances"("supplier_id", "reporting_period_id");
CREATE INDEX IF NOT EXISTS "supplier_balances_reporting_period_id_idx"
  ON "supplier_balances"("reporting_period_id");

CREATE TABLE "expense_categories" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_code_key" ON "expense_categories"("code");
CREATE INDEX IF NOT EXISTS "expense_categories_name_idx" ON "expense_categories"("name");
CREATE INDEX IF NOT EXISTS "expense_categories_is_active_idx" ON "expense_categories"("is_active");

CREATE TABLE "expenses" (
  "id" SERIAL NOT NULL,
  "reporting_period_id" INTEGER,
  "expense_category_id" INTEGER NOT NULL,
  "location_id" INTEGER,
  "expense_date" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "payment_method" TEXT,
  "reference_no" TEXT,
  "entered_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_expense_category_id_fkey"
  FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses"("expense_date");
CREATE INDEX IF NOT EXISTS "expenses_expense_category_id_idx" ON "expenses"("expense_category_id");
CREATE INDEX IF NOT EXISTS "expenses_location_id_idx" ON "expenses"("location_id");
CREATE INDEX IF NOT EXISTS "expenses_reporting_period_id_idx" ON "expenses"("reporting_period_id");

CREATE TABLE "employees" (
  "id" SERIAL NOT NULL,
  "employee_no" TEXT,
  "first_name" TEXT NOT NULL,
  "surname" TEXT NOT NULL,
  "middle_name" TEXT,
  "gender" TEXT,
  "date_of_birth" TIMESTAMP(3),
  "district_of_origin" TEXT,
  "village" TEXT,
  "traditional_authority" TEXT,
  "national_id" TEXT,
  "national_id_expiry_date" TIMESTAMP(3),
  "contact_number" TEXT,
  "date_of_employment" TIMESTAMP(3),
  "position" TEXT,
  "department" TEXT,
  "location_id" INTEGER,
  "employment_type" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employees_employee_no_key" ON "employees"("employee_no");
CREATE INDEX IF NOT EXISTS "employees_surname_first_name_idx" ON "employees"("surname", "first_name");
CREATE INDEX IF NOT EXISTS "employees_status_idx" ON "employees"("status");
CREATE INDEX IF NOT EXISTS "employees_department_idx" ON "employees"("department");
CREATE INDEX IF NOT EXISTS "employees_location_id_idx" ON "employees"("location_id");

CREATE TABLE "employee_salary_structures" (
  "id" SERIAL NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "agreed_salary_per_month" DOUBLE PRECISION NOT NULL,
  "annual_increment_amount" DOUBLE PRECISION DEFAULT 0,
  "salary_after_increment" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'MWK',
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_salary_structures_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_salary_structures"
  ADD CONSTRAINT "employee_salary_structures_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "employee_salary_structures_employee_id_is_current_idx"
  ON "employee_salary_structures"("employee_id", "is_current");
CREATE INDEX IF NOT EXISTS "employee_salary_structures_effective_from_effective_to_idx"
  ON "employee_salary_structures"("effective_from", "effective_to");

CREATE TABLE "payroll_periods" (
  "id" SERIAL NOT NULL,
  "reporting_period_id" INTEGER,
  "payroll_mode" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_periods_status_idx" ON "payroll_periods"("status");
CREATE INDEX IF NOT EXISTS "payroll_periods_payroll_mode_idx" ON "payroll_periods"("payroll_mode");
CREATE INDEX IF NOT EXISTS "payroll_periods_reporting_period_id_idx" ON "payroll_periods"("reporting_period_id");

CREATE TABLE "payroll_entries" (
  "id" SERIAL NOT NULL,
  "payroll_period_id" INTEGER NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "basic_salary" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "increment_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "gross_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "net_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "days_worked" DOUBLE PRECISION,
  "days_absent" DOUBLE PRECISION,
  "overtime_hours" DOUBLE PRECISION,
  "overtime_amount" DOUBLE PRECISION DEFAULT 0,
  "loan_deduction_amount" DOUBLE PRECISION DEFAULT 0,
  "other_deduction_amount" DOUBLE PRECISION DEFAULT 0,
  "bonus_amount" DOUBLE PRECISION DEFAULT 0,
  "gift_amount" DOUBLE PRECISION DEFAULT 0,
  "leave_pay_amount" DOUBLE PRECISION DEFAULT 0,
  "paye_amount" DOUBLE PRECISION DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payroll_entries"
  ADD CONSTRAINT "payroll_entries_payroll_period_id_fkey"
  FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_entries"
  ADD CONSTRAINT "payroll_entries_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_entries_payroll_period_id_employee_id_key"
  ON "payroll_entries"("payroll_period_id", "employee_id");
CREATE INDEX IF NOT EXISTS "payroll_entries_employee_id_idx" ON "payroll_entries"("employee_id");
CREATE INDEX IF NOT EXISTS "payroll_entries_payroll_period_id_idx" ON "payroll_entries"("payroll_period_id");

CREATE TABLE "employee_loans" (
  "id" SERIAL NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "loan_reference" TEXT,
  "principal_amount" DOUBLE PRECISION NOT NULL,
  "balance_amount" DOUBLE PRECISION NOT NULL,
  "monthly_deduction_amount" DOUBLE PRECISION,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_loans_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_loans"
  ADD CONSTRAINT "employee_loans_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "employee_loans_loan_reference_key" ON "employee_loans"("loan_reference");
CREATE INDEX IF NOT EXISTS "employee_loans_employee_id_idx" ON "employee_loans"("employee_id");
CREATE INDEX IF NOT EXISTS "employee_loans_status_idx" ON "employee_loans"("status");

CREATE TABLE "employee_loan_transactions" (
  "id" SERIAL NOT NULL,
  "employee_loan_id" INTEGER NOT NULL,
  "payroll_period_id" INTEGER,
  "transaction_type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_loan_transactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_loan_transactions"
  ADD CONSTRAINT "employee_loan_transactions_employee_loan_id_fkey"
  FOREIGN KEY ("employee_loan_id") REFERENCES "employee_loans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_loan_transactions"
  ADD CONSTRAINT "employee_loan_transactions_payroll_period_id_fkey"
  FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "employee_loan_transactions_employee_loan_id_idx" ON "employee_loan_transactions"("employee_loan_id");
CREATE INDEX IF NOT EXISTS "employee_loan_transactions_payroll_period_id_idx" ON "employee_loan_transactions"("payroll_period_id");
CREATE INDEX IF NOT EXISTS "employee_loan_transactions_transaction_type_idx" ON "employee_loan_transactions"("transaction_type");

CREATE TABLE "employee_terminations" (
  "id" SERIAL NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "termination_date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "days_worked_in_final_month" DOUBLE PRECISION,
  "half_pay_received" DOUBLE PRECISION,
  "settlement_amount" DOUBLE PRECISION,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_terminations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_terminations"
  ADD CONSTRAINT "employee_terminations_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "employee_terminations_employee_id_idx" ON "employee_terminations"("employee_id");
CREATE INDEX IF NOT EXISTS "employee_terminations_termination_date_idx" ON "employee_terminations"("termination_date");

CREATE TABLE "employee_reengagements" (
  "id" SERIAL NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "previous_wage" DOUBLE PRECISION,
  "reengagement_wage" DOUBLE PRECISION,
  "occupation" TEXT,
  "effective_date" TIMESTAMP(3) NOT NULL,
  "contract_expiry_date" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_reengagements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_reengagements"
  ADD CONSTRAINT "employee_reengagements_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "employee_reengagements_employee_id_idx" ON "employee_reengagements"("employee_id");
CREATE INDEX IF NOT EXISTS "employee_reengagements_effective_date_idx" ON "employee_reengagements"("effective_date");
