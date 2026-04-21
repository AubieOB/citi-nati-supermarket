# POS Agents Deployment Preparation (Pre-Packaging)

This document prepares both POS-related agents for production hosting changes without EXE packaging or startup registration.

## Identified Agents

### 1) Zomba POS Sync Agent
- Folder: Zomba POS Sync Agent/pos-sync-agent
- Entry file: server.js
- Purpose: Multi-location Zomba POS sync, product/stock/price push, command polling, emergency sales sync, reporting sync
- Port: PORT (default 3001)
- Main dependencies:
  - express
  - axios
  - mssql
  - dotenv

### 2) Blantyre POS Sync Agent
- Folder: Blantyre POS Pync Agent/pos-sync-agent
- Entry file: server.js
- Purpose: Blantyre POS sync, product/stock/price push, command polling, emergency sales sync, reporting sync
- Port: PORT (default 3001)
- Main dependencies:
  - express
  - axios
  - mssql
  - dotenv

## Shared Configuration Model

Both agents now use the same config loader pattern via lib/config.js:
- buildConfig()
- validateStartupConfig()
- buildStartupSummary()
- getSyncMetadata()

Environment switching is config-only.
No source edits are needed to move between development, staging, and production.

## Required Environment Variables

### Core runtime
- BACKEND_URL
- BACKEND_API_TOKEN (or POS_SECRET fallback)
- POS_SECRET
- PORT
- AGENT_NAME
- AGENT_ENV
- INSTANCE_LOCK_PORT

### SQL connection
- POS_DB_SERVER
- POS_DB_NAME
- POS_DB_USER
- POS_DB_PASSWORD
- POS_LOCATION_CODE

### Branch context
- BRANCH_CODE
- BRANCH_NAME
- LOCATION_ID
- SYNC_SOURCE_CODE

### Polling / sync
- POLLING_INTERVAL_MS (or POLL_INTERVAL_MS alias)
- COMMAND_POLL_INTERVAL_MS
- EMERGENCY_SALES_POLL_INTERVAL_MS
- REPORTING_POLLING_INTERVAL_MS
- REPORTING_BATCH_SIZE

### Optional diagnostics / safety
- BACKEND_CONNECTION_TEST_ENABLED
- BACKEND_CONNECTION_TIMEOUT_MS
- BACKEND_HEALTHCHECK_PATH

## Legacy Compatibility (Supported, Not Preferred)

- BACKEND_BASE_URL
- LIVE_SERVER_URL
- DB_SERVER / DB_NAME / DB_DATABASE / DB_USER / DB_PASSWORD

Preferred key for backend host is BACKEND_URL.

## Example .env Structure (Production)

```env
BRANCH_CODE=ZOMBA
BRANCH_NAME=Zomba
LOCATION_ID=2
SYNC_SOURCE_CODE=ZOMBA_POS_01

BACKEND_URL=https://your-backend-host
BACKEND_API_TOKEN=replace-with-backend-token
POS_SECRET=replace-with-agent-secret

POS_DB_SERVER=your-sql-host
POS_DB_NAME=POS
POS_DB_USER=pos_sync_writer
POS_DB_PASSWORD=replace-with-strong-password
POS_LOCATION_CODE=SH

PORT=3001
POLLING_INTERVAL_MS=60000
COMMAND_POLL_INTERVAL_MS=5000
EMERGENCY_SALES_POLL_INTERVAL_MS=7000
REPORTING_POLLING_INTERVAL_MS=60000
REPORTING_BATCH_SIZE=100

AGENT_NAME=zomba-pos-sync-agent
AGENT_ENV=production
INSTANCE_LOCK_PORT=13001
BACKEND_CONNECTION_TEST_ENABLED=true
BACKEND_CONNECTION_TIMEOUT_MS=5000
BACKEND_HEALTHCHECK_PATH=/api/health
```

## Startup Diagnostics Now Included

Both agents now log:
- Agent name
- Agent version
- Environment
- Branch/location context
- Backend URL
- Poll intervals
- Instance lock port
- Config validation warnings/errors

Both agents also perform:
- Duplicate-instance lock check (via INSTANCE_LOCK_PORT)
- Startup backend connectivity probe (health endpoint and fallback endpoint)

## Manual Run (No Packaging Yet)

### Zomba
```powershell
Set-Location "Zomba POS Sync Agent/pos-sync-agent"
npm start
```

### Blantyre
```powershell
Set-Location "Blantyre POS Pync Agent/pos-sync-agent"
npm start
```

## Out of Scope (Intentionally Not Done)

- EXE packaging
- Windows startup registration / auto-start installation
- Final installer creation
