ALTER TABLE "PosWriteCommand"
  ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PosWriteCommand_status_nextRetryAt_idx"
  ON "PosWriteCommand"("status", "nextRetryAt");
