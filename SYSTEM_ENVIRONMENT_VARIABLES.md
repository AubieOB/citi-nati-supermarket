# Citi-Nati Supermarket Environment Variables Reference

## Purpose

This document lists the important environment variables used by the Citi-Nati Supermarket system across:

- backend
- frontend
- Zomba POS sync agent
- Blantyre POS sync agent

Where legacy aliases exist, the preferred variable is called out clearly.

## Format

Each variable includes:

- Purpose
- Example
- Required or optional status

## Backend Variables

## 1. Core Application

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. | `postgresql://user:pass@host:5432/citi_nati` | Yes |
| `PORT` | Backend listening port. | `5000` | Yes |
| `NODE_ENV` | Runtime mode. Use `production` in production. | `production` | Yes |
| `LOG_LEVEL` | Application log level where supported. | `info` | No |

## 2. URLs And CORS

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `FRONTEND_URL` | Public frontend URL used for CORS and callbacks. | `https://shop.example.com` | Yes |
| `BACKEND_URL` | Public backend base URL used in callbacks and diagnostics. | `https://api.example.com` | Yes |
| `API_BASE_URL` | Alternate backend API base URL in some payment/debug paths. | `https://api.example.com/api` | No |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins. | `https://shop.example.com,https://admin.example.com` | No |
| `RENDER_EXTERNAL_URL` | Hosting-platform fallback used in some legacy URL logic. | `https://api.example.com` | No |
| `RENDER_EXTERNAL_URL_FRONTEND` | Hosting-platform fallback frontend URL. | `https://shop.example.com` | No |

## 3. Authentication And Sessions

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `JWT_SECRET` | Secret used to sign access tokens. | `replace-with-long-random-secret` | Yes |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access-token lifetime. | `1h` | No |
| `JWT_REFRESH_TOKEN_DAYS` | Refresh-token lifetime in days. | `30` | No |
| `MAX_FAILED_LOGIN_ATTEMPTS` | Lockout threshold for failed logins. | `5` | No |
| `LOGIN_LOCKOUT_MINUTES` | Lockout duration after repeated failed logins. | `5` | No |
| `PASSWORD_MIN_LENGTH` | Minimum password length. | `10` | No |
| `PASSWORD_MAX_LENGTH` | Maximum password length. | `128` | No |

## 4. Rate Limiting And Security Controls

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `REDIS_URL` | Redis connection used by selected rate-limit paths. | `redis://localhost:6379` | No |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | Login rate-limit time window. | `15` | No |
| `LOGIN_RATE_LIMIT_IP_MAX` | Max login attempts per IP. | `10` | No |
| `LOGIN_RATE_LIMIT_IDENTITY_MAX` | Max login attempts per identity. | `5` | No |
| `AUTH_RATE_LIMIT_MAX` | Generic auth route max requests. | `10` | No |
| `REFRESH_RATE_LIMIT_MAX` | Refresh-token request limit. | `30` | No |
| `ADMIN_RATE_LIMIT_MAX` | Admin route rate limit. | `300` | No |
| `POS_AGENT_RATE_LIMIT_MAX` | POS agent route rate limit. | `600` | No |
| `ENABLE_INSECURE_ADMIN_SETUP` | Enables development-only bootstrap routes. Never use in production. | `false` | No |
| `ADMIN_BOOTSTRAP_SECRET` | Secret for protected admin bootstrap flow. | `replace-with-bootstrap-secret` | No |

## 5. POS Sync And Branch Controls

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `ENABLE_POS_SYNC` | Enables backend POS integration features. | `true` | No |
| `POS_AGENT_URL` | Preferred POS agent URL used by backend service integration. | `http://branch-agent:3001` | Yes for POS-connected deployment |
| `POS_SYNC_AGENT_URL` | Legacy alternate POS agent URL variable. | `http://branch-agent:3001` | No |
| `VITE_POS_AGENT_URL` | Legacy frontend-style alias also checked in backend service fallback. | `http://branch-agent:3001` | No |
| `POS_SECRET` | Shared secret for agent ingest and agent communication. | `replace-with-agent-secret` | Yes for POS-connected deployment |
| `POS_AGENT_SECRET` | Legacy alias for POS secret. | `replace-with-agent-secret` | No |
| `POS_SYNC_SECRET` | Legacy alias for POS secret. | `replace-with-agent-secret` | No |
| `VITE_POS_SECRET` | Legacy frontend-style alias also checked in backend fallback. | `replace-with-agent-secret` | No |
| `BACKEND_API_TOKEN` | Agent-to-backend token accepted by backend auth middleware. | `replace-with-backend-token` | Recommended |
| `POS_SYNC_AGENT_API_KEY` | Legacy alternate agent auth token. | `replace-with-backend-token` | No |
| `POS_SYNC_ALLOWED_IPS` | Optional IP allow-list for agents. | `127.0.0.1,10.0.0.15` | No |
| `ALLOWED_AGENT_IPS` | Legacy alias for allowed agent IPs. | `127.0.0.1,10.0.0.15` | No |
| `POS_AGENT_TIMEOUT_MS` | Timeout for backend requests to POS agent. | `15000` | No |
| `POS_COMMAND_RETRY_DELAY_MS` | Retry delay for command queue operations. | `30000` | No |
| `POS_SYNC_AGENT_LIVENESS_WINDOW_MS` | Window used by monitor logic for agent liveness. | `60000` | No |
| `ENABLE_DIRECT_POS_WRITEBACK_DEBUG` | Enables direct debug write-back behavior. Leave off in production. | `false` | No |
| `POS_BRANCH_CODE` | Default branch code for POS-linked backend operations. | `BLANTYRE` | No |
| `BRANCH_CODE` | Alternate branch code fallback. | `ZOMBA` | No |
| `POS_LOCATION_CODE` | Default operational location code used by backend POS flows. | `SH` | Yes for POS-connected deployment |
| `POS_PRICE_TYPE_CODE` | Default POS price type for write-back operations. | `RT` | No |
| `POS_BLANTYRE_SELLING_LOCATION_CODE` | Default selling location for Blantyre promotion/write-back logic. | `SH` | No |
| `POS_BLANTYRE_PROMOTION_LOCATION_CODE` | Legacy Blantyre promotion location alias. | `SH` | No |
| `POS_ZOMBA_SELLING_LOCATION_CODE` | Default selling location for Zomba promotion/write-back logic. | `SH` | No |
| `POS_ZOMBA_PROMOTION_LOCATION_CODE` | Legacy Zomba promotion location alias. | `SH` | No |
| `STOREFRONT_LOCATION_CODE` | Backend storefront location default. | `BT` | No |
| `PUBLIC_STOREFRONT_LOCATION_CODE` | Alternate backend storefront location fallback. | `BT` | No |

## 6. Product, Expiry, And Emergency-Sale Controls

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `ADMIN_EXPIRY_ALERTS_REQUEST_TIMEOUT_MS` | Timeout for admin expiry enrichment requests. | `8000` | No |
| `EMERGENCY_SALE_MAX_RETRIES` | Max retry count for emergency sales sync. | `10` | No |
| `EMERGENCY_SCOPE_CODES_CACHE_TTL_MS` | Cache TTL for scoped emergency-sale product-code resolution. | `30000` | No |
| `EMERGENCY_LOOKUP_CACHE_TTL_MS` | Cache TTL for emergency-sale lookup results. | `8000` | No |

## 7. VAT And Business Time

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `POS_VAT_RATE` | Preferred VAT rate source for POS-related price calculations. | `16.5` | No |
| `VAT_RATE` | VAT rate fallback. | `16.5` | No |
| `VAT_ENABLED` | Enables or disables VAT calculations. | `true` | No |
| `BUSINESS_TZ_OFFSET_MINUTES` | Fixed timezone offset in minutes if used. | `120` | No |
| `BUSINESS_TIMEZONE_NAME` | Human-readable timezone identifier where supported. | `Africa/Blantyre` | No |

## 8. Payments

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `PAYCHANGU_PUBLIC_KEY` | Public PayChangu key. | `pub-live-xxxx` | Yes if payments are enabled |
| `PAYCHANGU_SECRET_KEY` | Secret PayChangu key used by backend. | `sec-live-xxxx` | Yes if payments are enabled |
| `PAYCHANGU_WEBHOOK_SECRET` | Secret used to verify webhook authenticity. | `replace-with-webhook-secret` | Yes if payments are enabled |
| `PAYCHANGU_ACCOUNT_ID` | PayChangu account identifier. | `5407509` | No |
| `PAYCHANGU_ACCOUNT_NAME` | Account display name. | `Citi-Nati Supermarket` | No |

## 9. Email And Mail Delivery

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `MAIL_PROVIDER` | Mail transport type, such as `smtp` or provider mode. | `smtp` | No |
| `MAIL_FROM` | Preferred sender email. | `noreply@citinati.com` | No |
| `FROM_EMAIL` | Sender email fallback. | `noreply@citinati.com` | No |
| `MAIL_FROM_NAME` | Sender display name. | `Citi-Nati Supermarket` | No |
| `SENDGRID_API_KEY` | SendGrid API key if using SendGrid provider. | `SG.xxxx` | No |
| `SMTP_HOST` | SMTP host. | `smtp.sendgrid.net` | No |
| `SMTP_PORT` | SMTP port. | `587` | No |
| `SMTP_SECURE` | SMTP TLS/SSL mode. | `true` | No |
| `SMTP_USER` | SMTP username. | `apikey` | No |
| `SMTP_PASS` | SMTP password or token. | `replace-with-smtp-secret` | No |
| `GOOGLE_CLIENT_ID` | Backend Google auth client ID reference. | `client-id.apps.googleusercontent.com` | No |

## 10. File Uploads And Media

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `WORKBOOK_UPLOAD_MAX_BYTES` | Max workbook upload size. | `20971520` | No |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for product images. | `my-cloud` | No |
| `CLOUDINARY_API_KEY` | Cloudinary API key. | `1234567890` | No |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. | `replace-with-cloudinary-secret` | No |

## 11. Admin Messaging And Alerts

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `ADMIN_MESSAGE_REOPEN_WINDOW_MS` | Window for admin message reopen behavior. | `300000` | No |
| `ADMIN_MESSAGE_EMIT_COOLDOWN_MS` | Cooldown for message emission. | `10000` | No |
| `SYSTEM_ALERT_RECURRENCE_WINDOW_MS` | Alert recurrence suppression window. | `600000` | No |

## 12. Business Operations And Workbook Tuning

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `EXPORT_COMPANY_CONTACT` | Printed company contact string for exports. | `Blantyre, Malawi` | No |
| `EXPORT_LOGO_PATH` | Path to export logo asset. | `./assets/logo.png` | No |
| `FULL_WORKBOOK_BATCH_SIZE` | Export batch size. | `1000` | No |
| `FULL_WORKBOOK_MAX_ROWS_PER_SHEET` | Max rows allowed per export sheet. | `250000` | No |
| `FULL_WORKBOOK_MAX_ROWS_TOTAL` | Max total export rows. | `700000` | No |
| `FULL_WORKBOOK_MAX_SALES_RANGE_DAYS` | Max sales date range for export. | `370` | No |
| `FULL_WORKBOOK_IMPORT_MAX_FILE_BYTES` | Max file size for workbook import. | `20971520` | No |
| `FULL_WORKBOOK_IMPORT_MAX_HEAP_MB` | Soft heap threshold for import processing. | `220` | No |
| `FULL_WORKBOOK_IMPORT_HARD_HEAP_MB` | Hard heap threshold for import processing. | `245` | No |
| `FULL_WORKBOOK_IMPORT_BATCH_SIZE` | Import batch size. | `100` | No |
| `FULL_WORKBOOK_IMPORT_MAX_ROWS_PER_SHEET` | Max rows per imported sheet. | `250000` | No |
| `FULL_WORKBOOK_IMPORT_MAX_ROWS_TOTAL` | Max total imported rows. | `700000` | No |

## Frontend Variables

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Base URL for frontend API requests. | `https://api.example.com/api` | Yes |
| `VITE_BACKEND_URL` | Base backend URL used by socket and utility layers. | `https://api.example.com` | Yes |
| `VITE_GOOGLE_CLIENT_ID` | Google client ID for frontend auth setup. | `client-id.apps.googleusercontent.com` | No |
| `VITE_APP_NAME` | App display name. | `Citi-Nati Supermarket` | No |
| `VITE_APP_VERSION` | App version string. | `1.0.0` | No |
| `VITE_ENABLE_DARK_MODE` | UI feature flag if used in presentation logic. | `false` | No |
| `VITE_POS_AGENT_URL` | POS agent URL referenced by current frontend utility code. | `http://localhost:3001` | No |
| `VITE_POS_SECRET` | POS secret referenced by current frontend utility code. Avoid exposing this in public production builds unless the feature is strictly internal and network-controlled. | `replace-with-agent-secret` | No |
| `VITE_STOREFRONT_BRANCH_CODE` | Storefront default branch scope for ambiguous locations such as `SH`. | `BLANTYRE` | Recommended |
| `VITE_STOREFRONT_LOCATION_CODE` | Storefront default location scope. | `BT` | Recommended |

## POS Agent Variables

These apply to both the Zomba and Blantyre agents unless otherwise noted.

## 1. Branch Identity

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `BRANCH_CODE` | Branch code handled by the agent. | `ZOMBA` | Yes |
| `BRANCH_NAME` | Human-readable branch name. | `Zomba` | Yes |
| `LOCATION_ID` | POS-side location identifier used in metadata. | `2` | Yes |
| `SYNC_SOURCE_CODE` | Sync source identifier reported to backend. | `ZOMBA_POS_01` | Yes |
| `SYNC_LOG_PREFIX` | Prefix used in agent logs. | `[ZOMBA SYNC]` | No |
| `AGENT_NAME` | Runtime agent name displayed in startup diagnostics. | `zomba-pos-sync-agent` | No |
| `AGENT_ENV` | Runtime environment label. | `production` | No |
| `AGENT_VERSION` | Informational version string. | `1.0.0` | No |

## 2. Backend Connectivity

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `BACKEND_URL` | Preferred backend base URL. | `https://api.example.com` | Yes |
| `BACKEND_BASE_URL` | Legacy backend URL fallback. | `https://api.example.com` | No |
| `LIVE_SERVER_URL` | Legacy backend URL fallback. | `https://api.example.com` | No |
| `BACKEND_API_TOKEN` | Token used when polling backend endpoints. | `replace-with-backend-token` | Recommended |
| `BACKEND_CONNECTION_TEST_ENABLED` | Enables startup backend connectivity test. | `true` | No |
| `BACKEND_CONNECTION_TIMEOUT_MS` | Timeout for backend startup probe. | `5000` | No |
| `BACKEND_HEALTHCHECK_PATH` | Health endpoint path used by startup check. | `/api/health` | No |
| `POS_AGENT_ID` | Agent instance identifier used in polling requests. | `shop-main-agent` | No |
| `COMMAND_POLL_TIMEOUT_MS` | Timeout for command polling requests. | `15000` | No |

## 3. POS SQL Server Connection

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `POS_DB_SERVER` | Preferred SQL Server host. | `192.168.1.10` | Yes |
| `POS_DB_NAME` | Preferred SQL database name. | `POS` | Yes |
| `POS_DB_USER` | SQL login user. | `pos_sync_writer` | Yes |
| `POS_DB_PASSWORD` | SQL login password. | `replace-with-strong-password` | Yes |
| `POS_LOCATION_CODE` | Canonical location code used by the agent. | `SH` | Yes |
| `POS_OPERATIONAL_LOCATION_CODES` | Comma-separated operational codes for multi-location agents such as Zomba. | `SH,BAR,ST999` | Zomba only |
| `POS_DB_CONNECTION_TIMEOUT_MS` | SQL connection timeout. | `30000` | No |
| `POS_DB_REQUEST_TIMEOUT_MS` | SQL request timeout. | `120000` | No |
| `DB_SERVER` | Legacy SQL server fallback. | `192.168.1.10` | No |
| `DB_NAME` | Legacy DB name fallback. | `POS` | No |
| `DB_DATABASE` | Legacy DB name fallback. | `POS` | No |
| `DB_USER` | Legacy DB user fallback. | `pos_sync_writer` | No |
| `DB_PASSWORD` | Legacy DB password fallback. | `replace-with-strong-password` | No |

## 4. Agent HTTP Server And Polling

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `PORT` | Agent listening port. | `3001` | Yes |
| `POLL_INTERVAL_MS` | Preferred primary polling interval. | `60000` | No |
| `POLLING_INTERVAL_MS` | Alternate primary polling interval variable. | `60000` | No |
| `SYNC_INTERVAL_MS` | Legacy primary polling interval variable. | `60000` | No |
| `COMMAND_POLL_INTERVAL_MS` | Interval for backend command polling. | `5000` | No |
| `EMERGENCY_SALES_POLL_INTERVAL_MS` | Interval for emergency-sale polling. | `7000` | No |
| `INSTANCE_LOCK_PORT` | Port reserved for duplicate-instance prevention. | `13001` | No |

## 5. Reporting Sync

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `REPORTING_BACKEND_ENDPOINT` | Backend endpoint for invoice reporting sync. | `/api/pos-sync/reporting/invoices` | No |
| `REPORTING_LATEST_COST_ENDPOINT` | Backend endpoint for latest-cost reporting sync. | `/api/pos-sync/reporting/latest-product-costs` | No |
| `REPORTING_BATCH_SIZE` | Invoice reporting sync batch size. | `100` | No |
| `REPORTING_LATEST_COST_BATCH_SIZE` | Latest-cost reporting sync batch size. | `500` | No |
| `REPORTING_POLLING_INTERVAL_MS` | Reporting sync interval. | `60000` | No |
| `REPORTING_LATEST_COST_INTERVAL_MS` | Latest-cost sync interval. | `300000` | No |
| `REPORTING_LIMIT_TO_RECENT_DAYS` | Limits reporting sync to recent days when set above zero. | `7` | No |

## 6. Feature Flags

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `ENABLE_REPORTING_SYNC` | Enables reporting sync module. | `true` | No |
| `ENABLE_ONLINE_ORDER_WRITEBACK` | Enables order write-back features. | `true` | No |
| `ENABLE_STOCK_WRITEBACK` | Enables stock write-back features. | `true` | No |
| `ENABLE_PROMOTION_SYNC` | Enables promotion sync/write-back. | `true` | No |
| `ENABLE_PRICE_SYNC` | Enables price sync/write-back. | `true` | No |
| `ENABLE_PRODUCT_NAME_SYNC` | Enables product-name sync/write-back. | `true` | No |
| `ENABLE_MANUAL_STOCK_SYNC` | Enables manual stock sync operations. | `true` | No |
| `ENABLE_INVOICE_WRITEBACK` | Enables invoice write-back flow. | `true` | No |
| `ENABLE_DIRECT_POS_WRITEBACK_DEBUG` | Enables debug-only direct write-back endpoint. | `false` | No |

## 7. Agent Security

| Variable | Purpose | Example | Required |
| --- | --- | --- | --- |
| `POS_SECRET` | Secret accepted by the agent for inbound requests and also used as backend token fallback. | `replace-with-agent-secret` | Yes |

## Recommended Production Defaults

Use these practices in production:

1. Prefer `BACKEND_URL` over `BACKEND_BASE_URL` and `LIVE_SERVER_URL`.
2. Prefer `POS_DB_*` variables over legacy `DB_*` variables.
3. Use a dedicated `BACKEND_API_TOKEN` instead of relying on `POS_SECRET` fallback.
4. Keep `ENABLE_DIRECT_POS_WRITEBACK_DEBUG=false`.
5. Keep `ENABLE_INSECURE_ADMIN_SETUP` disabled in production.
6. Use concrete location codes for Zomba deployments.

## Secret-Handling Rules

Do not commit real values for:

- `JWT_SECRET`
- `POS_SECRET`
- `BACKEND_API_TOKEN`
- `PAYCHANGU_SECRET_KEY`
- `PAYCHANGU_WEBHOOK_SECRET`
- `SENDGRID_API_KEY`
- `SMTP_PASS`
- `CLOUDINARY_API_SECRET`
- database passwords

## Final Notes

This system contains a mix of preferred modern variables and compatibility fallbacks. New deployments should use the preferred names first and keep legacy aliases only when needed for transition or backward compatibility.
