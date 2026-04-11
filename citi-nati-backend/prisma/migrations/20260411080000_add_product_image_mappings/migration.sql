-- CreateTable: product_image_mappings
-- Persistent mapping of Cloudinary image assets to POS ProductCode.
-- Survives product row deletion and POS full rebuilds.

CREATE TABLE "product_image_mappings" (
    "id"                    SERIAL NOT NULL,
    "product_code"          TEXT NOT NULL,
    "cloudinary_public_id"  TEXT NOT NULL,
    "image_url"             TEXT NOT NULL,
    "secure_url"            TEXT NOT NULL,
    "original_filename"     TEXT,
    "is_primary"            BOOLEAN NOT NULL DEFAULT true,
    "display_order"         INTEGER NOT NULL DEFAULT 0,
    "alt_text"              TEXT,
    "uploaded_by"           TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_image_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique lookup by product_code
CREATE UNIQUE INDEX "product_image_mappings_product_code_key" ON "product_image_mappings"("product_code");

-- CreateIndex: non-unique index for fast lookups
CREATE INDEX "product_image_mappings_product_code_idx" ON "product_image_mappings"("product_code");
