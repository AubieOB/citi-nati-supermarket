# Citi-Nati isolated ERP test store

This is a separate, password-protected operator test storefront using Citi-Nati's existing logo and stylesheet. It tests the AubieOne Custom Website contract without importing or changing the current website server, database, cart, checkout, payment, delivery, retention scheduler or POS code. Existing frontend/backend startup commands are unchanged. It is not a customer checkout replacement or a production connector rollout.

The site repository baseline is `39b5ca79f9690347c5c90f76ee6a6273afbbc340`. Work is isolated on `codex/erp-storefront-test`. No live site forms, orders, payments, database or VPS services are changed by preparing or running the local acceptance harness.

## What this store tests

- Scoped website credentials remain on the server; the browser sees published catalog data and public ERP status only.
- Confirm the one-use connection challenge, then explicitly activate the website in ERP.
- Load selected published products with tenant currency and available stock.
- Submit a sample order using public IDs and whole quantities. Currency comes from ERP; browser prices, totals and payment claims are rejected.
- Preserve the exact order request/idempotency key on disk before submission. Identical retries remain one ERP order; changed retries conflict. Network-ambiguous attempts retain their original request.
- Retrieve current order/payment/fulfillment status from ERP. Intake does not prove pricing validation or payment.
- Receive original signed notification bytes; validate HMAC, event ID and a five-minute timestamp window; acknowledge only after persistence. Event retries retain their ID; mismatched content conflicts.
- Notifications are hints. They never mark an order paid, create a Finance receipt, refund money or adjust inventory.

Only an authenticated test operator can access the UI/catalog/order endpoints. The notification endpoint authenticates the ERP signature. Sample orders require `.invalid` email addresses. One process owns the private data directory; a second process fails startup rather than racing the journal. Files contain synthetic order requests and event hashes, not ERP credentials. This simple journal is intended for a single-instance test deployment, not a multi-worker production service.

## Local verification

The AubieOne acceptance harness creates a fresh approved synthetic ERP database, applies existing migrations normally and creates isolated test tenants. It runs this store against actual ERP APIs, forwards actual outbox-signed bytes through a test-only transport to the loopback receiver, and exercises the page in an actual Electron browser. It never starts Citi-Nati's Prisma server or connects to its database.

From the AubieOne repository in PowerShell:

```powershell
$env:CITI_SITE_TEST_ROOT = 'C:\citi-nati-supermarket-test'
node apps/api/scripts/run-sales-group-acceptance.mjs --electron
```

The harness independently verifies its previously approved local configuration, host, port, database, owner and environment before any database access. Follow AubieOne AGENTS.md; do not substitute an arbitrary DATABASE_URL. This test increment adds no schema migration. Retain failed fixtures and logs instead of resetting databases.

No secrets are printed. The harness uses ephemeral scoped ERP credentials and a synthetic test-operator account, and disables the test channel when finished. Source hashes, assertions and the rendered website screenshot are retained under that run's `citi-site` directory.

The captured-source integration run `financial_authority_1791985544692` passed 73 combined checks, including 20 ERP Electron cases and one additional Citi browser case, with zero failures. It created two synthetic unpaid orders. These counts cover the captured ERP/site source, not later unrelated workspace edits or the original Citi customer checkout.

For an independent runtime check on a separate checkout, use:

```text
node erp-integration-test/verify-runtime.cjs
```

This probe uses built-in Node modules, ephemeral loopback listeners and a new temporary evidence directory. It checks disabled startup, authentication, branding assets, signed notification persistence/retry after restart and exclusive private journal ownership. It makes zero ERP requests and never reads site configuration, databases, PM2 or Nginx. On Linux it also verifies private journal-file permissions. Successful runtime verification is not an end-to-end ERP or public HTTPS test.

## Standalone configuration

Use a supported Node runtime with built-in fetch and AbortSignal.timeout; local verification uses Node 24. Copy `.env.example` to `.env.local` in this folder, which is ignored by Git. Explicitly confirm the approved **isolated test ERP tenant**, enable the test store, and configure its separate website credential, signing secret and operator password. Do not copy the original site's `.env` or production credentials.

```text
CITI_ERP_TEST_ENABLED=true
CITI_ERP_TEST_TENANT_CONFIRMED=ISOLATED_TEST_ONLY
```

Run from the site repository root:

```text
node --env-file=erp-integration-test/.env.local erp-integration-test/server.cjs
```

The server binds only `127.0.0.1`, default port 5081. The operator credentials protect all pages and API reads/writes. Use the exact loopback URL printed as a port-only startup message. The raw signing secret and ERP credential stay in the private server configuration. In ERP Websites, the notification endpoint is `/api/erp-test/notifications` on the selected test website's HTTPS origin.

HTTP ERP transport is restricted to loopback with NODE_ENV=test. Remote ERP access requires HTTPS and explicit test-tenant confirmation. The latter is an operator approval marker, not automatic proof that a remote tenant is non-production; independently verify its identity before enabling any requests.

## VPS deployment boundary

Prepare a separate checkout/directory, service, private journal and HTTPS test subdomain such as `erp-test.citinati.com`. Deploy the reviewed feature branch there. Keep the existing `citinati.com` document root, service, database, env files and default branch unchanged. Do not run the normal website `npm start` during this test setup: that script automatically applies Prisma migrations and the main server starts database maintenance, mail and POS-related workflows.

Before deployment, establish the authorized SSH account, existing service/document-root layout, unused port, test hostname/TLS routing and an approved externally reachable test ERP target. These details have not yet been confirmed. No VPS deploy, DNS/NGINX/service edits, live database access or live-site test submission is authorized by this README.

Any later integration of the original customer checkout must define publication/SKU mapping, source authority, delivery charges, customer ownership, payments and POS interaction. It needs its own review and isolated website database testing. This diagnostic store does not claim to have tested those original flows or native bookings.
