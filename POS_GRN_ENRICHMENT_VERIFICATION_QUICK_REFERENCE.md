# POS GRN Enrichment Runtime Verification – Quick Reference

## Summary

Comprehensive runtime verification has been implemented across all three layers of POS GRN enrichment:

### 1️⃣ **Agent Payload Layer** (`pos-sync-agent/server.js`)
- Logs: `[POS GRN AGENT PAYLOAD VERIFICATION]`
- Verifies: grnObservedAt, syncSourceCode, grnUserName present in each payload
- Purpose: Confirm enrichment starts at source

### 2️⃣ **Backend Ingest Layer** (`reportingSyncIngest.service.js`)
- Logs: `[POS GRN INGEST ENRICHMENT]`, `[POS GRN INGEST] Created/Updated`
- Verifies: Payload received, normalized, stored, and preserved on updates
- Purpose: Confirm metadata flows through ingest and survives re-sync cycles

### 3️⃣ **Ledger Query Layer** (`inventoryActivity.service.js`)
- Logs: `[PRISMA SELECT VERIFICATION]`, `[LEDGER STOCK_IN METADATA]`, `[POS GRN MAPPED ROW]`
- Verifies: All enrichment fields selected, metadata priority chain evaluated, row mapped correctly
- Purpose: Confirm ledger display uses enriched metadata

---

## What Gets Verified

| Layer | Field | Status |
|-------|-------|--------|
| Agent | `grnObservedAt` | ✅ Set to `new Date().toISOString()` at first sync |
| Agent | `syncSourceCode` | ✅ From config (always present) |
| Agent | `grnUserName` | ✅ From POS source or null |
| Ingest | Payload arrives intact | ✅ Logged on receive |
| Ingest | Normalization preserves fields | ✅ Logged after toDateOrNull() |
| Ingest | First create stores metadata | ✅ Logged with values written to DB |
| Ingest | Update preserves existing values | ✅ Logged with preservation logic |
| Ledger | Prisma selects all required fields | ✅ Logged with full field list |
| Ledger | Metadata priority chain | ✅ Logged for each row |
| Ledger | Fallback values applied | ✅ Logged when fallback used |
| Ledger | Local timestamp formatting | ✅ Logged with Blantyre timezone |

---

## Verification Flow Diagram

```
┌─────────────────────────────┐
│   POS SQL Server            │
│   (stocks, stockdetails)    │
└──────────────┬──────────────┘
               │
               │ Query POS GRN data
               │
┌──────────────▼──────────────────────────────────────┐
│ Agent: buildPosGrnPayload()                         │
│ ✅ Sets grnObservedAt = new Date().toISOString()   │
│ ✅ Includes syncSourceCode from config             │
│ ✅ Includes grnUserName from POS source            │
└──────────────┬──────────────────────────────────────┘
               │
               │ [POS GRN AGENT PAYLOAD VERIFICATION]
               │
┌──────────────▼──────────────────────────────────────┐
│ Backend: ingestPosStockIntakes()                    │
│ ✅ Receives & normalizes payload                   │
│ ✅ Stores grnObservedAt & grnUserName on create    │
│ ✅ Preserves existing values on update             │
└──────────────┬──────────────────────────────────────┘
               │
               │ [POS GRN INGEST ENRICHMENT]
               │ [POS GRN INGEST] Created/Updated
               │
┌──────────────▼──────────────────────────────────────┐
│ Database: pos_stock_intakes                        │
│ ✅ Stores grnObservedAt (new column)               │
│ ✅ Stores grnUserName                              │
│ ✅ Stores syncSourceCode                           │
└──────────────┬──────────────────────────────────────┘
               │
               │ Ledger query: getPOSGRNMovements()
               │
┌──────────────▼──────────────────────────────────────┐
│ Ledger: posStockIntakeItem.findMany() with select  │
│ ✅ All required fields selected by Prisma          │
│ ✅ Metadata priority chain evaluated               │
│ ✅ Rows mapped with enriched metadata              │
└──────────────┬──────────────────────────────────────┘
               │
               │ [PRISMA SELECT VERIFICATION]
               │ [LEDGER STOCK_IN METADATA]
               │ [POS GRN MAPPED ROW]
               │
┌──────────────▼──────────────────────────────────────┐
│ Frontend: InventoryActivityLedger.jsx              │
│ ✅ Displays corrected transactionDate/Time         │
│ ✅ Displays correct userName (operator)            │
└──────────────────────────────────────────────────────┘
```

---

## Migration

**File:** `citi-nati-backend/prisma/migrations/20260515000001_add_grn_observed_at_to_pos_stock_intakes/migration.sql`

**Command to apply:**
```bash
cd citi-nati-backend
npx prisma migrate deploy
```

**What it does:**
- Adds `grn_observed_at` TIMESTAMP(3) column to `pos_stock_intakes` table
- Allows storing first-observed sync timestamp per GRN

---

## Files Changed

1. ✅ `Blantyre POS Sync Agent/pos-sync-agent/server.js`
   - Added payload verification in `sendPosGrnsToBackend()`

2. ✅ `citi-nati-backend/src/services/reportingSyncIngest.service.js`
   - Added ingest verification logs
   - Logs preserved metadata preservation logic

3. ✅ `citi-nati-backend/src/services/business-operations/inventoryActivity.service.js`
   - Added Prisma select verification
   - Enhanced metadata priority chain logging
   - Improved debug visibility

4. ✅ `citi-nati-backend/prisma/migrations/20260515000001_add_grn_observed_at_to_pos_stock_intakes/migration.sql`
   - New migration (ready to deploy)

5. ✅ `POS_GRN_ENRICHMENT_RUNTIME_VERIFICATION.md`
   - Full documentation of verification implementation

---

## What Was NOT Changed

- ❌ **No changes to ledger math** – Balance calculations unchanged
- ❌ **No changes to sales logic** – Sales transaction mapping untouched
- ❌ **No changes to filters** – All existing filters work as before
- ❌ **No changes to closing balance** – Closing balance visibility preserved
- ❌ **No changes to sort order** – Ledger sorting unchanged
- ❌ **No changes to summary cards** – Intake/sales value calculations unchanged

---

## How to Monitor Verification

### In Agent Logs
```bash
grep "\[POS GRN AGENT PAYLOAD VERIFICATION\]" <agent-logs>
```

Expected:
```
[POS GRN AGENT PAYLOAD VERIFICATION] GRN #1: {
  grnNo: 'GRN-2025-001',
  grnObservedAt: '2025-03-15T14:32:45.123Z',
  syncSourceCode: 'BLANTYRE_POS_1',
  grnUserName: 'OPERATOR_01',
  ...
}
```

### In Backend Logs
```bash
# Ingest layer
grep "\[POS GRN INGEST" <backend-logs>

# Ledger query layer
grep "\[LEDGER STOCK_IN METADATA\]" <backend-logs>
```

Expected:
```
[POS GRN INGEST ENRICHMENT] Received payload: { ... }
[POS GRN INGEST] Created new GRN record: { ... }
[LEDGER STOCK_IN METADATA] Metadata selection priority chain: { ... }
```

---

## Deployment Checklist

- [ ] Backend migration applied (`npx prisma migrate deploy`)
- [ ] Agent deployed and running
- [ ] Backend deployed and running
- [ ] Monitor logs for verification messages
- [ ] Verify STOCK_IN rows show correct:
  - [ ] Transaction Date (from grnObservedAt)
  - [ ] Transaction Time (local Blantyre timezone)
  - [ ] User Name (operator identity, not "POS")
- [ ] Confirm balance and closing balance values unchanged
- [ ] Confirm sales transactions unaffected

---

**Status:** ✅ Implemented and committed
**Ready for deployment:** Yes
**Backward compatible:** Yes (field is optional, add-only)
**Requires migration:** Yes (apply with `npx prisma migrate deploy`)
