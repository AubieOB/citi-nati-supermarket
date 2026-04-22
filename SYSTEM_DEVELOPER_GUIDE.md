# Citi-Nati Supermarket System Developer Guide

## 1. Ownership and Attribution

- System Developer: Aubrey Mkhulana
- System Owner: [Insert owner name]
- Business Owner: [Insert business owner name]
- Technical Operations Contact: [Insert operations contact]

## 2. Purpose

This guide is a full step-by-step handbook for developers maintaining and improving the Citi-Nati Supermarket system.

Use this document to:

- understand architecture and critical domain rules
- run the full system locally
- make safe backend, frontend, and agent changes
- debug incidents and validate fixes
- deliver production-ready improvements with confidence

## 3. System Architecture at a Glance

Main runtime components:

1. Frontend (`citi-nati-frontend`): storefront + admin + role dashboards.
2. Backend (`citi-nati-backend`): API, auth, business logic, sync orchestration.
3. PostgreSQL: system-of-record data store managed by Prisma.
4. POS agents (Blantyre and Zomba): SQL Server bridge for sync and write-back.
5. Socket channel: real-time event updates to admin interfaces.

### Data flow: POS to web

1. Agent reads branch POS SQL Server data.
2. Agent sends signed payloads to backend ingest endpoints.
3. Backend validates, upserts, and emits events.
4. Frontend patches local visible state without destructive resets.

### Data flow: web to POS

1. Admin action creates a backend commandable event.
2. Agent polls backend command/report endpoints.
3. Agent executes SQL-side write-back.
4. Backend receives status and updates monitoring state.

## 4. Repository Map

Top-level project folders:

- `citi-nati-backend`
- `citi-nati-frontend`
- `Blantyre POS Pync Agent/pos-sync-agent`
- `Zomba POS Sync Agent/pos-sync-agent`

Backend high-value folders:

- `src/controllers`
- `src/services`
- `src/routes`
- `src/utils`
- `prisma`

Frontend high-value folders:

- `src/pages/public`
- `src/pages/admin`
- `src/pages/cashier`
- `src/pages/driver`
- `src/components/admin`
- `src/utils`

POS agent high-value files:

- `server.js`
- `lib/config.js`
- queue/sync/writeback modules under `lib`

## 5. Critical Domain Rules (Do Not Break)

### 5.1 Location and branch are first-class constraints

Stock and pricing are not global constants.

Canonical operational locations currently include:

- `BT` (Blantyre)
- `SH`, `BAR`, `ST999` (Zomba concrete locations)

### 5.2 Zomba operations require concrete location scope

Never allow ambiguous Zomba scope in reads or writes.

Representative backend guard:

```js
if (derivedBranchCode === 'ZOMBA') {
  if (!isConcreteZombaOperationalLocationCode(resolvedLocationCode)) {
    return res.status(400).json({
      error: 'Concrete locationCode is required for Zomba stock reads (use SH, BAR, or ST999)',
    });
  }
}
```

### 5.3 Product read model discipline

The Product table is the core web read model for product/state operations.

### 5.4 Admin UI stability rule

Prefer cache patching and stable background refresh.
Do not reintroduce full-list churn or visible flicker during background updates.

## 6. Local Development Setup (Step-by-Step)

## 6.1 Prerequisites

- Node.js 18+ (or current team standard)
- PostgreSQL running locally or accessible dev instance
- Git and terminal access

Optional for full integration testing:

- SQL Server access for agent testing
- Redis if testing distributed rate-limit behavior

## 6.2 Backend setup

```bash
cd citi-nati-backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Sanity checks:

1. Backend starts without Prisma errors.
2. Health route responds.
3. Login/register works against local DB.

## 6.3 Frontend setup

```bash
cd citi-nati-frontend
npm install
npm run dev
```

Sanity checks:

1. Storefront loads.
2. Products page can fetch API data.
3. Admin route loads for authorized user.

## 6.4 POS agent setup (branch)

```bash
cd "Blantyre POS Pync Agent/pos-sync-agent"
npm install
copy .env.example .env
npm start
```

Do the same for Zomba agent folder as needed.

## 7. Environment Variable Workflow

Primary reference: `ENVIRONMENT_SETUP_GUIDE.md`.

Rule of operation:

1. Start from documented templates.
2. Fill placeholders per environment.
3. Keep secrets out of source control.
4. Align shared secrets across backend and agent runtimes.

Quick backend example:

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=replace-with-strong-random-secret
FRONTEND_URL=https://app.example.com
POS_SECRET=replace-with-shared-pos-secret
```

## 8. Step-by-Step Change Workflow

## 8.1 Before coding

1. Identify impacted domain rules (especially branch/location).
2. Identify all runtime surfaces affected: backend, frontend, agent.
3. Define expected behavior for all locations, not just one.

## 8.2 During coding

1. Keep changes scoped and reversible.
2. Preserve existing API contract unless intentionally versioned.
3. Add focused comments only when logic is non-obvious.

## 8.3 After coding

1. Run lint/error checks.
2. Smoke-test impacted workflows.
3. Update docs where behavior changed.
4. Commit with precise message and push.

## 9. Backend Maintenance and Improvement Patterns

## 9.1 Add a new validated endpoint safely

Controller pattern:

```js
export async function getScopedResource(req, res) {
  const rawLocationCode = req.query.locationCode;
  const locationCode = normalizeLocationCode(rawLocationCode);

  if (!locationCode) {
    return res.status(400).json({ error: 'locationCode is required' });
  }

  const branchCode = deriveBranchCodeFromLocationCode(locationCode);

  if (branchCode === 'ZOMBA' && !isConcreteZombaOperationalLocationCode(locationCode)) {
    return res.status(400).json({
      error: 'Concrete locationCode is required for Zomba scope (use SH, BAR, or ST999)',
    });
  }

  const rows = await prisma.product.findMany({
    where: { branchCode, locationCode },
  });

  return res.json({ success: true, rows });
}
```

## 9.2 Emit real-time updates predictably

```js
// Keep event names stable and payloads minimal but sufficient.
global.io?.emit('productUpdated', {
  id: product.id,
  branchCode: product.branchCode,
  locationCode: product.locationCode,
  updatedAt: product.updatedAt,
});
```

## 9.3 Keep services focused

Good service design:

- one operational responsibility per service
- clear input/output shape
- no hidden side effects without logging

## 10. Frontend Maintenance and Improvement Patterns

## 10.1 Stable cache patching pattern

```js
setProducts((prev) => {
  const index = prev.findIndex((item) => item.id === patch.id);
  if (index === -1) return prev;

  const next = [...prev];
  next[index] = { ...next[index], ...patch };
  return next;
});
```

## 10.2 Prevent stale async response overwrite

```js
const requestIdRef = useRef(0);

async function runSearch(query) {
  const requestId = ++requestIdRef.current;
  const response = await api.get('/products', { params: { query } });
  if (requestId !== requestIdRef.current) return;
  setResults(response.data.products || []);
}
```

## 10.3 Preserve active filter scope in background refresh

```js
const activeLocationRef = useRef(locationCode);

useEffect(() => {
  activeLocationRef.current = locationCode;
}, [locationCode]);

async function refreshProducts() {
  const response = await api.get('/products', {
    params: { locationCode: activeLocationRef.current },
  });
  setProducts(response.data.products || []);
}
```

## 11. POS Agent Maintenance and Improvement Patterns

## 11.1 Central config validation is mandatory

Keep strict startup validation in `lib/config.js`.

```js
requireValue(config.posDb.server, 'Missing POS DB server (POS_DB_SERVER or DB_SERVER)');
requireValue(config.posDb.database, 'Missing POS DB name (POS_DB_NAME or DB_NAME/DB_DATABASE)');
requireValue(config.server.agentApiSecret, 'Missing agent API secret (POS_SECRET)');
```

## 11.2 Prefer explicit backend URL and token

```js
const backendBaseUrl = normalizeString(
  process.env.BACKEND_URL,
  normalizeString(process.env.BACKEND_BASE_URL, normalizeString(process.env.LIVE_SERVER_URL))
);
const backendApiToken = normalizeString(process.env.BACKEND_API_TOKEN, normalizeString(process.env.POS_SECRET));
```

## 11.3 Queue execution safety pattern

```js
try {
  await executeCommand(command);
  await reportCommandSuccess(command.id);
} catch (error) {
  await reportCommandFailure(command.id, String(error.message || 'Unknown failure'));
}
```

## 12. Database and Migration Workflow

## 12.1 Schema change process

1. Update Prisma schema.
2. Generate migration in dev.
3. Verify data compatibility.
4. Apply in production via deploy migration path.

Example:

```bash
npx prisma migrate dev --name add_new_business_field
npx prisma generate
```

## 12.2 Query hygiene rules

- always constrain by branch/location where relevant
- avoid unrestricted scans in high-traffic paths
- keep response payloads intentionally sized

## 13. Testing and Verification Playbooks

## 13.1 Minimum regression checklist for product/sync changes

1. Admin Products list remains stable during background refresh.
2. Admin Stocks search and category filters remain scoped.
3. POS Management list does not churn during pagination refresh.
4. Storefront category selection does not reset unexpectedly.
5. Zomba scope rules reject ambiguous location requests.

## 13.2 Payment and order verification checklist

1. Payment init route returns expected response.
2. Webhook signature verification remains valid.
3. Order payment status updates consistently.

## 13.3 Agent verification checklist

1. Startup summary loads with no missing required config.
2. SQL connection check passes.
3. Command polling and reporting sync succeed.

## 14. Debugging Guide (Step-by-Step)

## 14.1 Product sync looks stale

1. Check agent logs for sync failures.
2. Check backend ingest route logs for secret/scope rejections.
3. Confirm event emission is occurring.
4. Confirm frontend patch path is updating selected scope.

## 14.2 Zomba data appears empty or wrong

1. Verify request uses concrete `SH`, `BAR`, or `ST999`.
2. Verify normalization path from legacy aliases.
3. Verify agent payload branch/location tags.

## 14.3 Promotion behavior is inconsistent

1. Validate scope resolver behavior.
2. Validate scoped product resolution.
3. Validate write-back feature flags.

## 14.4 Delivery coverage blocks valid address

1. Verify district/area normalization.
2. Verify zone active state and coordinates.
3. Verify radius threshold logic and units.

## 15. Safe Improvement Playbooks

## 15.1 Add a new operational location

Update in one coordinated change-set:

1. Frontend operational scope mapping.
2. Backend normalization and branch derivation.
3. Promotion and emergency-sale scope logic.
4. Agent config and sync behavior (if POS-backed).
5. Documentation updates.

## 15.2 Add a new admin panel feature

1. Define backend contract first.
2. Implement permission-aware route/controller.
3. Add frontend panel state with stable refresh behavior.
4. Add event handling if realtime is required.
5. Validate on all operational locations.

## 15.3 Improve performance without behavior regressions

1. Measure first (API timings, payload sizes, render churn).
2. Optimize at bottleneck (query, transform, rerender, polling).
3. Keep correctness checks before and after optimization.

## 16. Code Review Checklist

Use this before merge:

1. Does code preserve branch/location safety?
2. Are validations explicit and user-safe?
3. Are errors actionable and structured?
4. Does frontend avoid unstable refresh churn?
5. Are secrets/config values handled correctly?
6. Is documentation updated if behavior changed?

## 17. Deployment and Release Guidance for Developers

Primary references:

- `SYSTEM_DEPLOYMENT_GUIDE.md`
- `ENVIRONMENT_SETUP_GUIDE.md`

Recommended release order:

1. Prepare env/config.
2. Deploy backend.
3. Smoke-test backend.
4. Deploy frontend.
5. Validate critical workflows.
6. Validate branch POS agent sync status.

## 18. Recommended Improvement Backlog

1. Add targeted automated integration tests for multi-location sync boundaries.
2. Expand structured observability and centralized log aggregation.
3. Add richer queue and sync diagnostics in admin monitoring interfaces.
4. Introduce explicit API contract tests for high-risk endpoints.

## 19. Final Maintenance Statement

This system is production-capable and maintainable when domain rules, scope safety, and stability patterns are preserved.

Developers should prioritize correctness and operational continuity over rapid but risky modification. Step-by-step maintenance, disciplined validation, and coordinated documentation updates are required standards for all future improvements.
