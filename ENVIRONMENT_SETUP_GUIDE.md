# Citi-Nati Supermarket Environment Setup Guide

## 1. Purpose of this guide

This guide documents environment variables used by the system and identifies what is truly required.
It includes deployment-ready placeholders for values you must provide.

Scope covered:

- backend service (`citi-nati-backend`)
- frontend service (`citi-nati-frontend`)
- branch POS sync agents

## 2. How to use this guide

1. Copy the template values for each component.
2. Replace every placeholder value before deployment.
3. Keep secrets out of source control.
4. Rotate credentials on a defined schedule.

## 3. Truly required environment variables (master table)

This table lists required variables by runtime condition.

- `Always`: required for normal production operation.
- `Conditional`: required only when a feature/module is enabled.

| Component | Variable | Required When | Why It Is Required | Placeholder You Must Fill |
|---|---|---|---|---|
| Backend | DATABASE_URL | Always | Prisma datasource uses `env("DATABASE_URL")`; backend cannot use DB without it | `<REPLACE_WITH_POSTGRES_CONNECTION_URL>` |
| Backend | JWT_SECRET | Always | JWT signing/verification depends on it in auth token utilities | `<REPLACE_WITH_STRONG_JWT_SECRET>` |
| Frontend | VITE_API_BASE_URL | Always (production frontend) | Frontend API client must target backend API URL | `<REPLACE_WITH_PUBLIC_API_URL>/api` |
| Frontend | VITE_BACKEND_URL | Always (production frontend) | Socket/auxiliary backend URL resolution uses it | `<REPLACE_WITH_PUBLIC_BACKEND_URL>` |
| Backend | POS_SECRET | Conditional: POS sync or POS agent auth enabled | Backend POS/agent endpoints validate shared secret | `<REPLACE_WITH_SHARED_POS_SECRET>` |
| Backend | POS_AGENT_URL | Conditional: `ENABLE_POS_SYNC` is true (default) | Backend POS sync service needs agent base URL | `<REPLACE_WITH_POS_AGENT_URL>` |
| Backend | PAYCHANGU_SECRET_KEY | Conditional: online payment initiation enabled | Payment API authorization uses this secret key | `<REPLACE_WITH_PAYCHANGU_SECRET_KEY>` |
| Backend | PAYCHANGU_PUBLIC_KEY | Conditional: payment frontend/public integration enabled | Payment provider public key required by payment flow | `<REPLACE_WITH_PAYCHANGU_PUBLIC_KEY>` |
| Backend | PAYCHANGU_WEBHOOK_SECRET | Conditional: payment webhook verification enabled | HMAC webhook signature verification depends on this secret | `<REPLACE_WITH_PAYCHANGU_WEBHOOK_SECRET>` |
| Backend | FRONTEND_URL | Conditional: production callback links, CORS finalization, and mail links | Used for callback URL generation and allowed origin resolution | `<REPLACE_WITH_PUBLIC_FRONTEND_URL>` |
| Backend | MAIL_PROVIDER | Conditional: email verification/reset enabled | Selects SMTP or SendGrid provider path | `<smtp_or_sendgrid>` |
| Backend | SMTP_HOST | Conditional: `MAIL_PROVIDER=smtp` | SMTP transport configuration requires host | `<REPLACE_WITH_SMTP_HOST>` |
| Backend | SMTP_PORT | Conditional: `MAIL_PROVIDER=smtp` | SMTP transport configuration requires port | `<REPLACE_WITH_SMTP_PORT>` |
| Backend | SMTP_USER | Conditional: `MAIL_PROVIDER=smtp` | SMTP auth username is required | `<REPLACE_WITH_SMTP_USERNAME>` |
| Backend | SMTP_PASS | Conditional: `MAIL_PROVIDER=smtp` | SMTP auth password/app-password is required | `<REPLACE_WITH_SMTP_PASSWORD>` |
| Backend | SENDGRID_API_KEY | Conditional: `MAIL_PROVIDER=sendgrid` | SendGrid provider path requires API key | `<REPLACE_WITH_SENDGRID_API_KEY>` |
| POS Agent | BRANCH_CODE | Always (each agent instance) | Agent startup config validation requires branch identity | `<BLANTYRE_or_ZOMBA>` |
| POS Agent | BRANCH_NAME | Always (each agent instance) | Agent startup config validation requires branch name | `<REPLACE_WITH_BRANCH_NAME>` |
| POS Agent | LOCATION_ID | Always (each agent instance) | Agent startup config validation requires location id | `<REPLACE_WITH_LOCATION_ID>` |
| POS Agent | SYNC_SOURCE_CODE | Always (each agent instance) | Agent startup config validation requires sync source identity | `<REPLACE_WITH_SYNC_SOURCE_CODE>` |
| POS Agent | POS_DB_SERVER | Always (or `DB_SERVER` fallback) | Agent startup config validation requires SQL Server host | `<REPLACE_WITH_POS_SQL_SERVER_HOST>` |
| POS Agent | POS_DB_NAME | Always (or `DB_NAME`/`DB_DATABASE` fallback) | Agent startup config validation requires SQL DB name | `<REPLACE_WITH_POS_SQL_DB_NAME>` |
| POS Agent | POS_DB_USER | Always (or `DB_USER` fallback) | Agent startup config validation requires SQL user | `<REPLACE_WITH_POS_SQL_USERNAME>` |
| POS Agent | POS_DB_PASSWORD | Always (or `DB_PASSWORD` fallback) | Agent startup config validation requires SQL password | `<REPLACE_WITH_POS_SQL_PASSWORD>` |
| POS Agent | BACKEND_URL | Conditional: reporting sync or command polling enabled | Agent requires backend URL for queue/reporting communication | `<REPLACE_WITH_PUBLIC_BACKEND_URL>` |
| POS Agent | BACKEND_API_TOKEN | Conditional: reporting sync or command polling enabled | Agent authenticates to backend using token (or POS_SECRET fallback) | `<REPLACE_WITH_AGENT_BACKEND_TOKEN>` |
| POS Agent | POS_SECRET | Always (agent API secret) | Agent startup config validation requires inbound API secret | `<REPLACE_WITH_SHARED_POS_SECRET>` |

## 4. Deployment-ready templates with placeholders

## 4.1 Backend `.env` template (production)

```env
# Core
DATABASE_URL=<REPLACE_WITH_POSTGRES_CONNECTION_URL>
JWT_SECRET=<REPLACE_WITH_STRONG_JWT_SECRET>
NODE_ENV=production
PORT=10000

# Public URLs
FRONTEND_URL=<REPLACE_WITH_PUBLIC_FRONTEND_URL>
BACKEND_URL=<REPLACE_WITH_PUBLIC_BACKEND_URL>

# POS integration
ENABLE_POS_SYNC=true
POS_AGENT_URL=<REPLACE_WITH_POS_AGENT_URL>
POS_SECRET=<REPLACE_WITH_SHARED_POS_SECRET>

# Payments (PayChangu)
PAYCHANGU_PUBLIC_KEY=<REPLACE_WITH_PAYCHANGU_PUBLIC_KEY>
PAYCHANGU_SECRET_KEY=<REPLACE_WITH_PAYCHANGU_SECRET_KEY>
PAYCHANGU_WEBHOOK_SECRET=<REPLACE_WITH_PAYCHANGU_WEBHOOK_SECRET>

# Mail (choose one provider)
MAIL_PROVIDER=smtp
MAIL_FROM=<REPLACE_WITH_FROM_EMAIL>
MAIL_FROM_NAME=Citi-Nati Supermarket
SMTP_HOST=<REPLACE_WITH_SMTP_HOST>
SMTP_PORT=<REPLACE_WITH_SMTP_PORT>
SMTP_SECURE=false
SMTP_USER=<REPLACE_WITH_SMTP_USERNAME>
SMTP_PASS=<REPLACE_WITH_SMTP_PASSWORD>
# SENDGRID_API_KEY=<REPLACE_WITH_SENDGRID_API_KEY>
```

## 4.2 Frontend `.env.production` template

```env
VITE_API_BASE_URL=<REPLACE_WITH_PUBLIC_API_URL>/api
VITE_BACKEND_URL=<REPLACE_WITH_PUBLIC_BACKEND_URL>
VITE_GOOGLE_CLIENT_ID=<REPLACE_WITH_GOOGLE_CLIENT_ID>
VITE_STOREFRONT_LOCATION_CODE=BT
VITE_APP_NAME=Citi-Nati Supermarket
VITE_APP_VERSION=1.0.0
```

## 4.3 POS agent `.env` template (branch)

```env
# Branch identity
BRANCH_CODE=<BLANTYRE_or_ZOMBA>
BRANCH_NAME=<REPLACE_WITH_BRANCH_NAME>
LOCATION_ID=<REPLACE_WITH_LOCATION_ID>
SYNC_SOURCE_CODE=<REPLACE_WITH_SYNC_SOURCE_CODE>

# Backend connectivity
BACKEND_URL=<REPLACE_WITH_PUBLIC_BACKEND_URL>
BACKEND_API_TOKEN=<REPLACE_WITH_AGENT_BACKEND_TOKEN>

# Agent security
POS_SECRET=<REPLACE_WITH_SHARED_POS_SECRET>

# POS SQL connection
POS_DB_SERVER=<REPLACE_WITH_POS_SQL_SERVER_HOST>
POS_DB_NAME=<REPLACE_WITH_POS_SQL_DB_NAME>
POS_DB_USER=<REPLACE_WITH_POS_SQL_USERNAME>
POS_DB_PASSWORD=<REPLACE_WITH_POS_SQL_PASSWORD>
POS_LOCATION_CODE=<REPLACE_WITH_LOCATION_CODE>

# Runtime
PORT=3001
POLLING_INTERVAL_MS=60000
COMMAND_POLL_INTERVAL_MS=5000
EMERGENCY_SALES_POLL_INTERVAL_MS=7000
```

## 5. Variable provenance notes

Required-variable determination source:

- Prisma schema datasource requirements (`DATABASE_URL`)
- backend auth token utility usage (`JWT_SECRET`)
- frontend runtime env references in API/socket utilities
- backend payment controller checks (`PAYCHANGU_SECRET_KEY` path)
- mail configuration validation rules (`SMTP_*` or `SENDGRID_API_KEY`)
- POS agent startup config validation in agent config module

## 6. Security handling rules

1. Never commit real secrets to git.
2. Use platform secret managers where possible.
3. Rotate secrets after incidents or staff changes.
4. Keep backend and agent shared secrets synchronized.
5. Use distinct tokens per environment (dev/staging/prod).

## 7. Validation checklist before go-live

1. Backend starts and connects to DB.
2. Frontend loads and reaches backend API.
3. Login and token issuance work.
4. Payment init works with live/test provider key set.
5. Email send test succeeds with chosen provider.
6. Each POS agent passes startup validation with no missing required fields.

## 8. Troubleshooting by variable class

## 8.1 Authentication failures

Check:

- `JWT_SECRET`
- token expiry settings (if customized)

## 8.2 Payment failures

Check:

- `PAYCHANGU_SECRET_KEY`
- `PAYCHANGU_WEBHOOK_SECRET`
- callback URL variables (`FRONTEND_URL`, backend URL)

## 8.3 Email failures

Check:

- `MAIL_PROVIDER`
- SMTP or SendGrid credentials according to provider path

## 8.4 POS sync failures

Check:

- `POS_SECRET` value match between backend and agents
- `POS_AGENT_URL` in backend
- `BACKEND_URL` and `BACKEND_API_TOKEN` on agent
- `POS_DB_*` credentials on agent

## 9. Change control note

When required environment variables change in code or startup validations, this guide must be updated in the same release.
