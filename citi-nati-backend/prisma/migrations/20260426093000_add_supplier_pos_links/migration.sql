-- CreateTable
CREATE TABLE "supplier_pos_links" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "branch_code" TEXT NOT NULL,
    "pos_supplier_code" INTEGER,
    "pos_supplier_name" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'synced',
    "synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pos_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_pos_links_supplier_id_branch_code_key" ON "supplier_pos_links"("supplier_id", "branch_code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_pos_links_branch_code_pos_supplier_code_key" ON "supplier_pos_links"("branch_code", "pos_supplier_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_pos_links_branch_code_idx" ON "supplier_pos_links"("branch_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_pos_links_sync_status_idx" ON "supplier_pos_links"("sync_status");

-- AddForeignKey
ALTER TABLE "supplier_pos_links" ADD CONSTRAINT "supplier_pos_links_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
