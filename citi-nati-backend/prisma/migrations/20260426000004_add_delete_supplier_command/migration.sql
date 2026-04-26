-- Safe migration: add DELETE_SUPPLIER to PosCommandType enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'DELETE_SUPPLIER'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PosCommandType')
  ) THEN
    ALTER TYPE "PosCommandType" ADD VALUE 'DELETE_SUPPLIER';
  END IF;
END $$;
