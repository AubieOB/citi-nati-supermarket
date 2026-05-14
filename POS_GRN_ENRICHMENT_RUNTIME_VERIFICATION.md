# POS GRN Enrichment – Runtime Verification Implementation

## Overview

Comprehensive runtime verification logs have been added across all three layers of the POS GRN enrichment pipeline:
1. **Agent Payload** – POS Sync Agent payload building and sending
2. **Backend Ingest** – reportingSyncIngest.service.js receive & normalize
3. **Ledger Query** – inventoryActivity.service.js Prisma select & mapping

All verification preserves existing balance, sales, filter, and closing balance logic. **No mathematical changes made.**

---

## 1. POS Sync Agent Payload Verification

**File:** `Blantyre POS Sync Agent/pos-sync-agent/server.js`

**Function:** `sendPosGrnsToBackend(posGrns)`

### Verification Logs Added

```javascript
// RUNTIME VERIFICATION: Log agent payload enrichment
posGrns.slice(0, 3).forEach((grn, idx) => {
  console.log(`[POS GRN AGENT PAYLOAD VERIFICATION] GRN #${idx + 1}:`, {
    grnNo: grn.grnNo,
    grnDate: grn.grnDate,
    grnObservedAt: grn.grnObservedAt,  // REQUIRED: agent-generated timestamp
    syncSourceCode: SYNC_SOURCE_CODE,  // Always present from config
    grnUserName: grn.userName || grn.grnUserName || null,  // User name from source
    itemCount: (grn.items || []).length,
  });
});
```

### What This Verifies

✅ **grnObservedAt** – Timestamp generated at first observation (line 298: `new Date().toISOString()`)
✅ **syncSourceCode** – Branch sync source code from config (always present)
✅ **grnUserName** – POS user identity if available from source tables
✅ **Payload completeness** – Each GRN includes all required enrichment fields

### Sample Log Output

```
[POS GRN AGENT PAYLOAD VERIFICATION] GRN #1: {
  grnNo: 'GRN-2025-001',
  grnDate: '2025-03-15T00:00:00.000Z',
  grnObservedAt: '2025-03-15T14:32:45.123Z',
  syncSourceCode: 'BLANTYRE_POS_1',
  grnUserName: 'OPERATOR_01',
  itemCount: 3
}
```

---

## 2. Backend Ingest Verification

**File:** `citi-nati-backend/src/services/reportingSyncIngest.service.js`

**Function:** `ingestPosStockIntakes(payload)`

### Verification Logs Added

#### A. Payload Reception & Normalization
```javascript
console.log('[POS GRN INGEST ENRICHMENT] Received payload:', {
  grnNo,
  payloadGrnDate: grn.grnDate,
  payloadGrnObservedAt: grn.grnObservedAt,
  payloadGrnUserName: grn.userName || grn.grnUserName || null,
  payloadSyncSourceCode: batchMeta.syncSourceCode,
  normalizedData: {
    grnDate: grnData.grnDate,
    grnObservedAt: grnData.grnObservedAt,
    grnUserName: grnData.grnUserName,
    syncSourceCode: grnData.syncSourceCode,
  },
});
```

#### B. On Create (First Record)
```javascript
console.log('[POS GRN INGEST] Created new GRN record:', {
  grnNo,
  storedGrnObservedAt: grnRecord.grnObservedAt,
  storedGrnUserName: grnRecord.grnUserName,
});
```

#### C. On Update (Preservation Logic)
```javascript
console.log('[POS GRN INGEST] Updating existing GRN record:', {
  grnNo,
  existingGrnObservedAt: existingGrn.grnObservedAt,
  preservingGrnObservedAt: !!existingGrn.grnObservedAt,
  existingGrnUserName: existingGrn.grnUserName,
  preservingGrnUserName: !!existingGrn.grnUserName && !updateData.grnUserName,
  updateDataGrnObservedAt: updateData.grnObservedAt,
  updateDataGrnUserName: updateData.grnUserName,
});
```

### What This Verifies

✅ **Payload arrives intact** – grnObservedAt and syncSourceCode present on receive
✅ **Normalization preserves fields** – No data loss during toDateOrNull() / toStringOrNull() conversion
✅ **First-create sets metadata** – grnObservedAt and grnUserName stored on initial insert
✅ **Update preserves metadata** – Existing values not overwritten on re-sync
✅ **Fallback logic** – syncSourceCode used if grnUserName is null

### Sample Log Output

```
[POS GRN INGEST ENRICHMENT] Received payload: {
  grnNo: 'GRN-2025-001',
  payloadGrnDate: '2025-03-15T00:00:00.000Z',
  payloadGrnObservedAt: '2025-03-15T14:32:45.123Z',
  payloadGrnUserName: 'OPERATOR_01',
  payloadSyncSourceCode: 'BLANTYRE_POS_1',
  normalizedData: {
    grnDate: 2025-03-15T00:00:00.000Z,
    grnObservedAt: 2025-03-15T14:32:45.123Z,
    grnUserName: 'OPERATOR_01',
    syncSourceCode: 'BLANTYRE_POS_1'
  }
}

[POS GRN INGEST] Created new GRN record: {
  grnNo: 'GRN-2025-001',
  storedGrnObservedAt: 2025-03-15T14:32:45.123Z,
  storedGrnUserName: 'OPERATOR_01'
}
```

On re-sync:
```
[POS GRN INGEST] Updating existing GRN record: {
  grnNo: 'GRN-2025-001',
  existingGrnObservedAt: 2025-03-15T14:32:45.123Z,
  preservingGrnObservedAt: true,
  existingGrnUserName: 'OPERATOR_01',
  preservingGrnUserName: false,
  updateDataGrnObservedAt: 2025-03-15T14:32:45.123Z,
  updateDataGrnUserName: 'OPERATOR_01'
}
```

---

## 3. Ledger Query & Mapping Verification

**File:** `citi-nati-backend/src/services/business-operations/inventoryActivity.service.js`

**Function:** `getPOSGRNMovements(period, filters)`

### Verification Logs Added

#### A. Prisma Select Fields
```javascript
console.log('[PRISMA SELECT VERIFICATION] posStockIntakeItem.findMany() will select:', {
  requiredFields: [
    'id',
    'productCode',
    'productName',
    'quantity',
    'unitCost',
    'lineAmount',
    'sourceUpdatedAt',
    'sourceSyncedAt',
    'createdAt',
  ],
  posStockIntakeRelation: [
    'grnNo',
    'grnDate',
    'grnObservedAt (PRIORITY 1)',
    'sourceSyncedAt (PRIORITY 2)',
    'sourceUpdatedAt (PRIORITY 3)',
    'grnUserName',
    'syncSourceCode',
    'branchCode',
    'locationCode',
    'supplierCode',
    'orderNumber',
    'grnReference',
    'createdAt',
    'updatedAt',
  ],
});
```

#### B. Metadata Selection Priority
```javascript
console.log('[LEDGER STOCK_IN METADATA] Metadata selection priority chain:', {
  grnNo: item.posStockIntake.grnNo,
  productCode: item.productCode,
  movementDateSource: {
    grnObservedAt: item.posStockIntake.grnObservedAt || 'NULL',
    sourceSyncedAt: item.posStockIntake.sourceSyncedAt || 'NULL',
    sourceUpdatedAt: item.posStockIntake.sourceUpdatedAt || 'NULL',
    grnDate: item.posStockIntake.grnDate || 'NULL',
    updatedAt: item.posStockIntake.updatedAt || 'NULL',
    createdAt: item.posStockIntake.createdAt || 'NULL',
  },
  selectedMovementDate: movementDate.toISOString(),
  userSource: {
    grnUserName: item.posStockIntake.grnUserName || 'NULL',
    syncSourceCode: item.posStockIntake.syncSourceCode || 'NULL',
    fallback: 'POS GRN Sync',
  },
  selectedUser,
});
```

#### C. Mapped Row
```javascript
console.log('[POS GRN MAPPED ROW]', mappedRow);
```

### What This Verifies

✅ **Prisma selects all required fields** – grnObservedAt, syncSourceCode, grnUserName present in result set
✅ **Metadata priority chain** – grnObservedAt checked first, then sourceSyncedAt, sourceUpdatedAt, grnDate
✅ **User fallback chain** – grnUserName checked first, then syncSourceCode, then 'POS GRN Sync'
✅ **Local timestamp formatting** – movementDate converted to Blantyre timezone for display
✅ **No null values in final output** – All fields have fallback or default values

### Sample Log Output

```
[PRISMA SELECT VERIFICATION] posStockIntakeItem.findMany() will select: {
  requiredFields: [...],
  posStockIntakeRelation: [
    'grnNo',
    'grnDate',
    'grnObservedAt (PRIORITY 1)',
    ...
  ]
}

[LEDGER STOCK_IN METADATA] Metadata selection priority chain: {
  grnNo: 'GRN-2025-001',
  productCode: 'PROD-001',
  movementDateSource: {
    grnObservedAt: '2025-03-15T14:32:45.123Z',
    sourceSyncedAt: NULL,
    sourceUpdatedAt: NULL,
    grnDate: '2025-03-15T00:00:00.000Z',
    updatedAt: '2025-03-15T14:35:00.000Z',
    createdAt: '2025-03-15T14:35:00.000Z'
  },
  selectedMovementDate: '2025-03-15T14:32:45.123Z',
  userSource: {
    grnUserName: 'OPERATOR_01',
    syncSourceCode: NULL,
    fallback: 'POS GRN Sync'
  },
  selectedUser: 'OPERATOR_01'
}

[POS GRN MAPPED ROW] {
  id: 'pos-grn-GRN-2025-001-PROD-001',
  type: 'pos_grn',
  movementDate: 2025-03-15T14:32:45.123Z,
  movementType: 'STOCK_IN',
  transactionDate: '2025-03-15',
  transactionTime: '14:32:45',
  productCode: 'PROD-001',
  productName: 'Product Name',
  userName: 'OPERATOR_01',
  ...
}
```

---

## Migration Status

**File:** `citi-nati-backend/prisma/migrations/20260515000001_add_grn_observed_at_to_pos_stock_intakes/migration.sql`

The migration file has been created and is ready to apply:

```sql
ALTER TABLE "pos_stock_intakes"
ADD COLUMN IF NOT EXISTS "grn_observed_at" TIMESTAMP(3);
```

### Execution Steps

1. In terminal, navigate to `citi-nati-backend/`
2. Run: `npx prisma migrate deploy`
3. Verify: `npx prisma migrate status` should show the migration as applied

---

## Verification Checklist

After deployment and sync, verify logs contain:

- [ ] **Agent Layer** – `[POS GRN AGENT PAYLOAD VERIFICATION]` shows non-null grnObservedAt for each GRN
- [ ] **Ingest Layer** – `[POS GRN INGEST ENRICHMENT]` shows payload received with all required fields
- [ ] **Ingest Layer** – `[POS GRN INGEST] Created/Updated` shows grnObservedAt and grnUserName stored
- [ ] **Ledger Layer** – `[PRISMA SELECT VERIFICATION]` confirms all fields selected
- [ ] **Ledger Layer** – `[LEDGER STOCK_IN METADATA]` shows priority chain evaluation for each row
- [ ] **Ledger Layer** – `[POS GRN MAPPED ROW]` shows transactionTime in local Blantyre timezone

---

## No Changes Made To

✅ Balance calculation logic
✅ Sales transaction mapping
✅ Ledger filtering
✅ Closing balance visibility
✅ Sort order
✅ Summary card math (intake value, total intake)

---

## Files Modified

1. **Blantyre POS Sync Agent/pos-sync-agent/server.js**
   - Added agent payload verification logs in `sendPosGrnsToBackend()`

2. **citi-nati-backend/src/services/reportingSyncIngest.service.js**
   - Added ingest enrichment logs in `ingestPosStockIntakes()`
   - Logs show received payload, normalization, and preservation logic

3. **citi-nati-backend/src/services/business-operations/inventoryActivity.service.js**
   - Added Prisma select verification
   - Enhanced metadata priority chain logs
   - All existing balance and filter logic preserved

4. **citi-nati-backend/prisma/migrations/20260515000001_add_grn_observed_at_to_pos_stock_intakes/migration.sql**
   - New migration file (not yet applied; ready for `npx prisma migrate deploy`)

---

## Next Steps

1. **Apply Migration** – Run `npx prisma migrate deploy` in backend
2. **Deploy Backend** – Commit and push changes
3. **Deploy Agent** – Commit and push agent changes
4. **Monitor Logs** – Watch for verification logs in sync runs
5. **Validate Ledger** – Confirm STOCK_IN rows show correct timestamps and user names

---

## Log Keywords for Grep

Use these keywords to isolate verification logs:

```bash
# Agent payload
grep "\[POS GRN AGENT PAYLOAD VERIFICATION\]" <agent-logs>

# Backend ingest
grep "\[POS GRN INGEST" <backend-logs>

# Ledger Prisma select
grep "\[PRISMA SELECT VERIFICATION\]" <backend-logs>

# Ledger metadata mapping
grep "\[LEDGER STOCK_IN METADATA\]" <backend-logs>
```

---

**Implementation Date:** 2025-03-15
**Status:** Ready for testing and deployment
