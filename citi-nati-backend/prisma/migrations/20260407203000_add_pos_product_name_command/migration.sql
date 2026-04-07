DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PosCommandType'
      AND e.enumlabel = 'UPDATE_PRODUCT_NAME'
  ) THEN
    ALTER TYPE "PosCommandType" ADD VALUE 'UPDATE_PRODUCT_NAME';
  END IF;
END $$;
