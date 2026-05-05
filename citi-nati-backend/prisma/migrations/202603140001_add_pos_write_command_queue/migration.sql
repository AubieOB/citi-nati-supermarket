-- Create enums for POS command queue
CREATE TYPE "PosCommandType" AS ENUM (
  'UPDATE_PRICE',
  'UPDATE_STOCK',
  'APPLY_PROMOTION',
  'REVERT_PROMOTION',
  'WRITE_INVOICE'
);

CREATE TYPE "PosCommandStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

-- Create persistent command queue table
CREATE TABLE "PosWriteCommand" (
  "id" TEXT NOT NULL,
  "commandType" "PosCommandType" NOT NULL,
  "status" "PosCommandStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "pickedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 5,
  "errorMessage" TEXT,
  "resultSummary" JSONB,
  "agentId" TEXT,
  "lockToken" TEXT,

  CONSTRAINT "PosWriteCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PosWriteCommand_status_createdAt_idx"
  ON "PosWriteCommand"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "PosWriteCommand_agentId_status_idx"
  ON "PosWriteCommand"("agentId", "status");
