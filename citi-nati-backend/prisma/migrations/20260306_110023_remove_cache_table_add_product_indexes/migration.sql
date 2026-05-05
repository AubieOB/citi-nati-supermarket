-- DropTable
DROP TABLE IF EXISTS "WebsiteProductsCache";

-- Ensure required Product columns exist before creating indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Product'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'enabled'
    ) THEN
      ALTER TABLE "Product" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'category'
    ) THEN
      ALTER TABLE "Product" ADD COLUMN "category" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = 'name'
    ) THEN
      ALTER TABLE "Product" ADD COLUMN "name" TEXT;
    END IF;
  END IF;
END $$;

-- Create indexes on Product table for performance
CREATE INDEX IF NOT EXISTS "Product_enabled_idx" ON "Product"("enabled");
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");
