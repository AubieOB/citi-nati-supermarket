-- Add durable dedupe/lifecycle fields for admin inbox flood control
ALTER TABLE "AdminMessage"
ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT,
ADD COLUMN IF NOT EXISTS "source_module" TEXT,
ADD COLUMN IF NOT EXISTS "branch_code" TEXT,
ADD COLUMN IF NOT EXISTS "entity_type" TEXT,
ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
ADD COLUMN IF NOT EXISTS "error_code" TEXT,
ADD COLUMN IF NOT EXISTS "lifecycle_state" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "occurrence_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "status_metadata" JSONB;

-- Backfill existing rows so lifecycle timestamps are populated consistently
UPDATE "AdminMessage"
SET
  "first_seen_at" = COALESCE("first_seen_at", "createdAt"),
  "last_seen_at" = COALESCE("last_seen_at", "updatedAt", "createdAt"),
  "lifecycle_state" = COALESCE(NULLIF("lifecycle_state", ''), 'active'),
  "occurrence_count" = CASE WHEN "occurrence_count" IS NULL OR "occurrence_count" < 1 THEN 1 ELSE "occurrence_count" END;

CREATE INDEX IF NOT EXISTS "AdminMessage_type_createdAt_idx"
  ON "AdminMessage"("type", "createdAt");

CREATE INDEX IF NOT EXISTS "AdminMessage_dedupeKey_lifecycle_state_last_seen_at_idx"
  ON "AdminMessage"("dedupeKey", "lifecycle_state", "last_seen_at");

CREATE INDEX IF NOT EXISTS "AdminMessage_branch_code_type_last_seen_at_idx"
  ON "AdminMessage"("branch_code", "type", "last_seen_at");
