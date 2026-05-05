ALTER TABLE "Order"
ADD COLUMN "district" TEXT,
ADD COLUMN "area" TEXT;

CREATE TABLE "DeliveryZone" (
  "id" SERIAL NOT NULL,
  "district" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radiusKm" DOUBLE PRECISION,
  "deliveryFee" DECIMAL(10,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryZone_district_area_key" ON "DeliveryZone"("district", "area");
CREATE INDEX IF NOT EXISTS "DeliveryZone_district_isActive_idx" ON "DeliveryZone"("district", "isActive");
