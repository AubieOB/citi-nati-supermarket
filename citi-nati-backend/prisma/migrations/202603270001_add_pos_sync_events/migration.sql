CREATE TABLE "PosSyncEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "reason" TEXT,
  "suggestion" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "agentId" TEXT,
  "durationMs" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PosSyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PosSyncEvent_createdAt_idx" ON "PosSyncEvent"("createdAt");
CREATE INDEX "PosSyncEvent_status_createdAt_idx" ON "PosSyncEvent"("status", "createdAt");
CREATE INDEX "PosSyncEvent_level_createdAt_idx" ON "PosSyncEvent"("level", "createdAt");
CREATE INDEX "PosSyncEvent_source_createdAt_idx" ON "PosSyncEvent"("source", "createdAt");
CREATE INDEX "PosSyncEvent_eventType_createdAt_idx" ON "PosSyncEvent"("eventType", "createdAt");