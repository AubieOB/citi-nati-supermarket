-- Create WebsiteProductsCache table
-- This table is the single source of truth for website product data
-- POS Sync Agent upserts into this table
-- Website reads from this table (fast, filtered queries)

CREATE TABLE "WebsiteProductsCache" (
    "ProductCode" VARCHAR(50) NOT NULL PRIMARY KEY,
    "ProductName" VARCHAR(255) NOT NULL,
    "Category" VARCHAR(100),
    "Barcode" VARCHAR(100),
    "Price" DECIMAL(18,2) NOT NULL,
    "Stock" INTEGER NOT NULL DEFAULT 0,
    "Enabled" BOOLEAN NOT NULL DEFAULT true,
    "LastUpdated" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on Enabled for faster filtering
CREATE INDEX "idx_website_products_cache_enabled" ON "WebsiteProductsCache"("Enabled");

-- Create index on Category for faster category filtering
CREATE INDEX "idx_website_products_cache_category" ON "WebsiteProductsCache"("Category");

-- Create index on ProductName for faster search/ordering
CREATE INDEX "idx_website_products_cache_product_name" ON "WebsiteProductsCache"("ProductName");
