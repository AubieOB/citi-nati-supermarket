CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_permissions_user_id_permission_key_key"
ON "user_permissions"("user_id", "permission_key");

CREATE INDEX IF NOT EXISTS "user_permissions_permission_key_idx"
ON "user_permissions"("permission_key");

ALTER TABLE "user_permissions"
ADD CONSTRAINT "user_permissions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "permission_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "target_user_id" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "previous_value" BOOLEAN,
  "new_value" BOOLEAN,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permission_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "permission_audit_logs_target_user_id_created_at_idx"
ON "permission_audit_logs"("target_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "permission_audit_logs_actor_user_id_created_at_idx"
ON "permission_audit_logs"("actor_user_id", "created_at");

ALTER TABLE "permission_audit_logs"
ADD CONSTRAINT "permission_audit_logs_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "permission_audit_logs"
ADD CONSTRAINT "permission_audit_logs_target_user_id_fkey"
FOREIGN KEY ("target_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
