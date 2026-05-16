This migration file was replaced to be a minimal, non-destructive patch for
the Purchase Order Sheet feature. The original baseline export accidentally
contained the entire database creation SQL and was unsafe for production.

This migration now only:
- Adds `shelf_balance`, `pos_balance`, and `selling_price` to
	`purchase_order_items` (if missing).
- Adds related indexes if they do not exist.
- Adds necessary foreign key constraints if missing.

DO NOT use the previous baseline migration; this file is safe for
`prisma migrate deploy` as it only performs additive operations.
