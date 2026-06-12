CREATE TABLE "MobilePushToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "driverId" TEXT,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'android',
  "app" TEXT NOT NULL DEFAULT 'driver',
  "deviceId" TEXT,
  "deviceName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushToken_token_key" ON "MobilePushToken"("token");
CREATE INDEX "MobilePushToken_userId_app_isActive_idx" ON "MobilePushToken"("userId", "app", "isActive");
CREATE INDEX "MobilePushToken_driverId_app_isActive_idx" ON "MobilePushToken"("driverId", "app", "isActive");

ALTER TABLE "MobilePushToken"
ADD CONSTRAINT "MobilePushToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
