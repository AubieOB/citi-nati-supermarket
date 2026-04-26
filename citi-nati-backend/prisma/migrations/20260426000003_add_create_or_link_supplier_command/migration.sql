-- Add CREATE_OR_LINK_SUPPLIER to PosCommandType enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PosCommandType' AND e.enumlabel = 'CREATE_OR_LINK_SUPPLIER'
  ) THEN
    ALTER TYPE "PosCommandType" ADD VALUE 'CREATE_OR_LINK_SUPPLIER';
  END IF;
END$$;
