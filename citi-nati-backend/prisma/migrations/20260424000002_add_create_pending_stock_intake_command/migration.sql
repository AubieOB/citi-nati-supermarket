-- Add CREATE_PENDING_STOCK_INTAKE to PosCommandType enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PosCommandType' AND e.enumlabel = 'CREATE_PENDING_STOCK_INTAKE'
  ) THEN
    ALTER TYPE "PosCommandType" ADD VALUE 'CREATE_PENDING_STOCK_INTAKE';
  END IF;
END$$;
