-- Driver availability, presence, and delivery timing workflow.
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);

ALTER TABLE "Driver"
ADD COLUMN IF NOT EXISTS "availability" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN IF NOT EXISTS "availability_reason" TEXT,
ADD COLUMN IF NOT EXISTS "availability_updated_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "presence_status" TEXT NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN IF NOT EXISTS "presence_updated_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_driver_status_idx" ON "Order"("driverId", "status");
CREATE INDEX IF NOT EXISTS "Order_delivery_timing_idx" ON "Order"("started_at", "delivered_at");
CREATE INDEX IF NOT EXISTS "Driver_availability_presence_idx" ON "Driver"("availability", "presence_status");
