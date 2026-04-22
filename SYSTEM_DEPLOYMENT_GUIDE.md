# Citi-Nati Supermarket System Deployment Guide

## 1. Purpose of this guide

This guide provides a complete production deployment process for the Citi-Nati system.
It covers backend, frontend, database, and branch POS agents.

This guide is written for technical operators and deployment owners.

## 2. Deployment scope

Production components:

- PostgreSQL database
- Backend API (`citi-nati-backend`)
- Frontend web app (`citi-nati-frontend`)
- Blantyre POS sync agent
- Zomba POS sync agent

## 3. Architecture summary

Core flow:

1. Frontend sends API and socket traffic to backend.
2. Backend reads and writes PostgreSQL.
3. Backend integrates with payment and mail providers.
4. POS agents sync branch POS SQL data with backend.

## 4. Recommended hosting model

Recommended production stack:

- Backend: Render web service
- Frontend: Render static site
- Database: Render PostgreSQL (or managed PostgreSQL equivalent)
- POS agents: Windows branch machines near each POS SQL Server

## 5. Pre-deployment checklist

Before first production deploy, confirm:

1. Repo access and branch protection are configured.
2. Domain/subdomain plan is finalized.
3. Production database is provisioned.
4. Required environment variables are prepared.
5. PayChangu live credentials are available.
6. Mail provider credentials are available.
7. POS agent machine credentials and SQL access are confirmed.
8. Secrets are generated with strong random values.

## 6. Backend deployment (`citi-nati-backend`)

## 6.1 Backend build/start commands

```bash
npm install
npx prisma generate
npm start
```

`npm start` runs Prisma deploy migrations before starting server.

## 6.2 Backend service setup (Render)

1. Create Web Service from repository.
2. Set root directory to `citi-nati-backend`.
3. Set build command to `npm install && npx prisma generate`.
4. Set start command to `npm start`.
5. Add required backend environment variables from `ENVIRONMENT_SETUP_GUIDE.md`.
6. Deploy and wait for healthy status.

## 6.3 Backend validation checks

After deploy:

1. Confirm backend health endpoint responds.
2. Confirm Prisma can connect to database.
3. Confirm auth token flow works (login/register).
4. Confirm payment init path works in test mode.
5. Confirm socket connection succeeds from frontend.

## 7. Frontend deployment (`citi-nati-frontend`)

## 7.1 Frontend build command

```bash
npm install
npm run build
```

## 7.2 Frontend service setup (Render)

1. Create Static Site from repository.
2. Set root directory to `citi-nati-frontend`.
3. Set build command to `npm install && npm run build`.
4. Set publish directory to `dist`.
5. Add required frontend environment variables from `ENVIRONMENT_SETUP_GUIDE.md`.
6. Add SPA rewrite rule: `/*` -> `/index.html`.
7. Deploy and verify route deep-links.

## 7.3 Frontend validation checks

1. Open storefront home.
2. Open products and verify API data loads.
3. Test login/register flow.
4. Test admin dashboard route access.
5. Test cashier and driver route access permissions.

## 8. Database deployment and migration

## 8.1 PostgreSQL setup

1. Provision PostgreSQL instance.
2. Create production DB and user.
3. Put connection string into `DATABASE_URL`.
4. Ensure SSL mode matches host requirements.

## 8.2 Migration workflow

1. Deploy backend with correct `DATABASE_URL`.
2. Backend start executes `prisma migrate deploy`.
3. Review logs to confirm migrations applied.

## 8.3 Database safety controls

1. Enable automated backups.
2. Restrict network access.
3. Rotate DB credentials on schedule.
4. Monitor DB storage and connection limits.

## 9. POS sync agent deployment

## 9.1 Agent locations

- `Blantyre POS Pync Agent/pos-sync-agent`
- `Zomba POS Sync Agent/pos-sync-agent`

## 9.2 Agent setup steps (each branch)

1. Install Node.js on Windows machine.
2. Copy agent folder to machine.
3. Create `.env` from `.env.example`.
4. Fill required agent environment variables.
5. Run `npm install`.
6. Start agent and verify startup summary is clean.

## 9.3 Agent startup validation

Agent startup validation fails when required settings are missing.
Required fields include branch identity, POS DB credentials, POS secret, and backend connectivity values.

## 9.4 Agent post-deploy checks

1. Agent health endpoint responds.
2. Agent can connect to branch SQL Server.
3. Backend can poll command queue with token.
4. Product and reporting sync records appear in backend monitor.

## 10. Domain and TLS

## 10.1 Domain mapping

Typical production mapping:

- Frontend: `app.your-domain.com`
- Backend API: `api.your-domain.com`

## 10.2 TLS requirements

1. Enforce HTTPS for all public endpoints.
2. Ensure backend CORS includes frontend production URL.
3. Update callback URLs for payment and OAuth providers.

## 11. Release process (safe sequence)

Recommended sequence:

1. Prepare env vars in hosting platform.
2. Deploy backend first.
3. Run smoke checks on backend.
4. Deploy frontend.
5. Validate end-to-end customer flow.
6. Validate admin and POS operations.
7. Validate payment webhook handling.

## 12. Post-deployment smoke test checklist

## 12.1 Customer flow

1. Register/login.
2. Browse products and add to cart.
3. Checkout and payment initiation.
4. Payment success and order visibility.

## 12.2 Admin flow

1. Open admin dashboard.
2. Verify products and stocks load.
3. Verify POS monitor and emergency sales views.
4. Verify driver assignment flow.

## 12.3 POS flow

1. Verify cashier dashboard access.
2. Process one emergency sale.
3. Verify receipt actions and sync status.
4. Confirm reporting visibility in admin.

## 13. Rollback and incident response

## 13.1 Backend rollback

1. Redeploy previous known-good backend build.
2. Confirm migrations compatibility before rollback.
3. Re-run smoke tests.

## 13.2 Frontend rollback

1. Redeploy previous known-good frontend artifact.
2. Verify API base URL still points correctly.

## 13.3 Incident evidence to capture

- service name and deployment version
- exact timestamp and timezone
- endpoint and payload context
- log excerpt and error text
- affected branch/location scope

## 14. Troubleshooting quick reference

## 14.1 Backend starts but fails requests

Checks:

1. Validate `DATABASE_URL`.
2. Validate `JWT_SECRET` exists.
3. Validate CORS frontend origin.
4. Check provider credentials for payment/mail failures.

## 14.2 Frontend loads but API calls fail

Checks:

1. Validate `VITE_API_BASE_URL`.
2. Validate backend service is reachable.
3. Confirm CORS allows deployed frontend origin.

## 14.3 POS sync not working

Checks:

1. Validate agent `.env` required values.
2. Confirm `POS_SECRET` matches backend expectation.
3. Confirm branch SQL credentials and DB accessibility.
4. Confirm backend token is valid for agent polling.

## 15. Related guides

Use together with:

- `ENVIRONMENT_SETUP_GUIDE.md`
- `RENDER_DEPLOYMENT_GUIDE.md`
- `RENDER_DEPLOYMENT_POS_GUIDE.md`

## 16. Change control note

When deployment topology, commands, or required env values change, update this file and the environment setup guide in the same release.
