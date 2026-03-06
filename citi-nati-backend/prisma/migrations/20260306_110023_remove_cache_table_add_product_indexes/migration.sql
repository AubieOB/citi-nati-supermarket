-- DropTable
DROP TABLE IF EXISTS "WebsiteProductsCache";

-- CreateIndex on Product table for performance
CREATE INDEX IF NOT EXISTS "Product_enabled_idx" ON "Product"("enabled");
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");
