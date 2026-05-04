# Zomba POS Product Sync - Comprehensive Fix (2026-05-04)

## Problem Statement

Zomba POS agent was NOT reliably pushing products to backend despite Blantyre working correctly. After product deletion and agent restart, Zomba products failed to reappear.

**Impact:**
- All 3 Zomba locations affected: Zomba SH, Zomba BAR, Zomba Restaurant (ST999)
- Emergency Sale search unreliable
- Stock and price updates stale

## Root Cause Analysis

### Critical Issue: LocationCode Loss in Payload

**What Blantyre Does (Works):**
- Single location (SH)
- Hardcoded `locationCode: appConfig.posDb.locationCode` in payload (line 235 of Blantyre server.js)
- All products marked as SH - no collision risk because Blantyre is single-location

**What Zomba Was Doing (BROKEN):**
- Multiple locations (SH, BAR, ST999)
- `fetchProductsFromPOS(locationCode)` correctly fetches per-location products
- **CRITICAL BUG** in `sendProductsToLiveServer()` line 570 (before fix):
  ```javascript
  locationCode: p.LocationCode || appConfig.posDb.locationCode,
  ```
- If `p.LocationCode` was undefined/null for ANY reason, ALL products defaulted to SH
- This collapsed BAR and ST999 products into the SH namespace
- Backend upsert (branchCode + locationCode + productCode) then overwrote/lost products

### Secondary Issues Fixed

1. **No validation** that products have LocationCode before sending
   - Silent failure if LocationCode missing
   - No alerting admin of data corruption

2. **No batch retry logic**
   - Single failure aborted entire batch
   - No attempt to recover

3. **Insufficient logging**
   - Batch location breakdown not visible
   - No startup config confirmation
   - No per-location sync status

4. **No manual full-sync endpoint**
   - Admin had to wait for next AUTO SYNC cycle
   - No way to force immediate refresh after deletion/fix

---

## Solution Implemented

### 1. **Fix LocationCode Preservation (CRITICAL)**

**File:** `Zomba POS Sync Agent/pos-sync-agent/server.js`

**Change:** Line 570 in `sendProductsToLiveServer()`

**Before:**
```javascript
locationCode: p.LocationCode || appConfig.posDb.locationCode,
```

**After:**
```javascript
// CRITICAL: Validate every product has LocationCode before sending.
const productsWithMissingLocation = batch.filter((p) => {
  const locCode = String(p.LocationCode || '').trim();
  return !locCode || locCode.length === 0;
});

if (productsWithMissingLocation.length > 0) {
  const missingCount = productsWithMissingLocation.length;
  const sampleCodes = productsWithMissingLocation.slice(0, 3).map((p) => String(p.ProductCode || 'UNKNOWN'));
  console.error(`${SYNC_LOG_PREFIX} CRITICAL: products batch ${batchIndex + 1} has ${missingCount} products with missing LocationCode. Sample: ${sampleCodes.join(', ')}. This indicates a product fetch/enrichment bug. Batch will be rejected.`);
  totalErrors++;
  batchCompleted = true;
  break;
}

// Then use LocationCode DIRECTLY, NO fallback:
locationCode: locCode,  // where locCode = String(p.LocationCode || '').trim().toUpperCase()
```

**Effect:**
- Products without LocationCode are rejected with clear error
- All sent products have correct location scope
- No silent corruption

---

### 2. **Batch Retry Logic with Better Error Handling**

**File:** `Zomba POS Sync Agent/pos-sync-agent/server.js`

**Change:** Enhanced error handling in batch send loop (lines 535-635)

**Added:**
- `MAX_BATCH_ATTEMPTS = 2` (retry up to 2 times per batch)
- Proper error classification (HTTP status, response body logging)
- Continue with next batch even if one fails (does not halt entire sync)
- Clear logging of which batches failed after max attempts

**Benefit:**
- Transient network errors don't abort entire sync
- Failed batches identified clearly in logs for investigation

---

### 3. **Comprehensive Startup Logging**

**File:** `Zomba POS Sync Agent/pos-sync-agent/server.js`

**Function:** `logStartupConfiguration()` (lines 3148-3195)

**Added:**
```
[BOOT] Runtime: Node v13.x.x
[BOOT] Agent: zomba-pos-sync-agent v1.0.0
[BOOT] Branch: Zomba (ZOMBA)
[BOOT] Source: ZOMBA_POS_01 | LocationId: 2
[BOOT][ZOMBA] Operational locations configured: SH, BAR, ST999
[BOOT] Backend URL: https://www.citinati.com
[BOOT] POS Database: 192.168.1.149/POS
[BOOT] Polling interval: 15000ms
[BOOT] Feature flags: {
  enableReportingSync: true,
  enableOnlineOrderWriteback: true,
  enableStockWriteback: true,
  enablePriceSync: true,
  enableProductNameSync: true,
  enableInvoiceWriteback: true
}
```

**Benefit:**
- Operator can verify startup config before sync begins
- Confirms all 3 locations enabled
- Backend connectivity shown explicitly

---

### 4. **Per-Batch Location Breakdown Logging**

**File:** `Zomba POS Sync Agent/pos-sync-agent/server.js`

**Added:** Lines 569-574

Before each batch send:
```
[ZOMBA SYNC] Sending products batch 1/16 (100 rows, attempt 1/2) {
  SH: 35,
  BAR: 40,
  ST999: 25
}
```

After successful send:
```
[ZOMBA SYNC] products synced (batch 1/16, attempt 1/2) {
  synced: 100,
  batchSize: 100,
  batchLocationBreakdown: { SH: 35, BAR: 40, ST999: 25 }
}
```

**Benefit:**
- Visible confirmation that all 3 locations are in each batch
- Product distribution per location transparent
- Easy to spot if one location is missing (e.g., all SH, zero BAR/ST999 = bug)

---

### 5. **Manual Full-Sync Endpoint**

**File:** `Zomba POS Sync Agent/pos-sync-agent/server.js`

**Endpoint:** `POST /pos-sync/force-full-sync`

**Usage:**
```bash
curl -X POST \
  -H "x-pos-secret: MySuperSecret123" \
  http://localhost:5000/pos-sync/force-full-sync
```

**Response:**
```json
{
  "success": true,
  "message": "Full product sync queued for all operational locations (SH, BAR, ST999)",
  "locations": ["SH", "BAR", "ST999"],
  "branchCode": "ZOMBA",
  "queuedAt": "2026-05-04T10:30:45.123Z"
}
```

**Behavior:**
- Queues immediate full product refresh (all locations)
- Returns immediately (non-blocking)
- Auto-sync begins in background
- No wait for next 15-second poll cycle

**Use Case:**
- After deleting Zomba products from admin/backend
- Force immediate refresh without restarting agent
- Verify fix works end-to-end

---

### 6. **Backend Upsert Scope Verification**

**File:** `citi-nati-backend/src/controllers/product.controller.js`

**Lines:** 2455-2468 (findFirst to identify existing product)

Confirmed composite key lookup:
```javascript
const existingProduct = await prisma.product.findFirst({
  where: {
    sourceCode,        // Product code (e.g., "9501100002174")
    branchCode,         // Branch (e.g., "ZOMBA")
    locationCode: productLocationCode,  // Location (e.g., "BAR", "ST999", "SH")
  },
  ...
});
```

**Then upsert by ID** (lines 2540-2549):
```javascript
const result = existingProduct
  ? await prisma.product.update({
      where: { id: existingProduct.id },
      data: baseProductData,  // NO branchCode/locationCode in update - preserved from original
    })
  : await prisma.product.create({
      data: {
        branchCode,
        sourceCode,
        ...baseProductData,
        ...
      },
    });
```

**Scope is CORRECT:**
- New products: all 3 fields (branchCode, locationCode, sourceCode) in create
- Existing products: matched by composite key, updated by ID (scope preserved)
- No risk of Blantyre SH overwriting Zomba SH

---

## Node 13 Compatibility Verification

**File:** `Zomba POS Sync Agent/pos-sync-agent/server.js`

**Checked for:**
- ❌ Optional chaining (`?.`) - NOT USED
- ❌ Nullish coalescing (`??`) - NOT USED
- ❌ `node:events` imports - NOT USED
- ✅ Uses proper `&&` checks
- ✅ Uses ternary operators
- ✅ Uses explicit null/undefined tests

**Result:** Code is compatible with Node 13 as-is.

---

## Expected Behavior After Fix

### 1. **On Startup**
- Agent logs show: "Operational locations configured: SH, BAR, ST999"
- Backend URL and database confirmed
- Feature flags all true
- No errors in startup validation

### 2. **During AUTO SYNC (Every 15 seconds)**
- Fetches products from all 3 locations sequentially
- Location breakdown logged: `{ SH: 1200, BAR: 800, ST999: 600 }`
- Batches (max 100 per batch): 16 batches sent
- Each batch shows location breakdown before/after send
- Successful send: "products synced (batch X/16)"
- Failed batch: retry up to 2 times, then skip to next batch

### 3. **Test: Delete and Resync**

**Step 1: Delete Zomba products**
```sql
DELETE FROM "Product" WHERE "branchCode" = 'ZOMBA';
```

**Step 2: Trigger manual sync**
```bash
curl -X POST \
  -H "x-pos-secret: MySuperSecret123" \
  http://localhost:5000/pos-sync/force-full-sync
```

**Step 3: Verify logs**
- "Full product sync queued for all operational locations (SH, BAR, ST999)"
- Within 5 seconds: "[AUTO SYNC] Fetched X products from location SH"
- Within 5 seconds: "[AUTO SYNC] Fetched Y products from location BAR"
- Within 5 seconds: "[AUTO SYNC] Fetched Z products from location ST999"
- Within 10 seconds: All batches sent successfully

**Step 4: Verify DB**
- Products reappear in backend
- Zomba SH products: ~1200 products with branchCode="ZOMBA", locationCode="SH"
- Zomba BAR products: ~800 products with branchCode="ZOMBA", locationCode="BAR"
- Zomba ST999 products: ~600 products with branchCode="ZOMBA", locationCode="ST999"
- Blantyre products unaffected (separate branchCode="BLANTYRE")

**Step 5: Verify Frontend**
- Admin/Products panel with "Zomba SH" location filter shows ~1200 products
- Admin/Products panel with "Zomba BAR" location filter shows ~800 products
- Admin/Products panel with "Zomba Restaurant" filter shows ~600 products
- Blantyre products isolated in separate branch

---

## Deployment Steps

### 1. **Backup Current Agent**
```bash
cd "Zomba POS Sync Agent"
cp -r pos-sync-agent pos-sync-agent.backup.2026-05-04
```

### 2. **Pull Latest Changes**
```bash
cd "Zomba POS Sync Agent/pos-sync-agent"
git pull origin main
```

### 3. **Restart Agent**
- Stop current agent process
- Start new agent with: `npm start` or `node server.js`
- Wait 30 seconds for AUTO SYNC first cycle

### 4. **Verify Startup Logs**
```
[ZOMBA SYNC][BOOT] Operational locations configured: SH, BAR, ST999
[ZOMBA SYNC][BOOT] Backend URL: https://www.citinati.com
[ZOMBA SYNC] Fetched 1200 products from location SH
[ZOMBA SYNC] Fetched 800 products from location BAR
[ZOMBA SYNC] Fetched 600 products from location ST999
[ZOMBA SYNC] products sync complete { totalProducts: 2600, ... }
```

### 5. **Test Manual Sync Endpoint**
```bash
curl -X POST \
  -H "x-pos-secret: MySuperSecret123" \
  http://localhost:5000/pos-sync/force-full-sync
```

Expected response:
```json
{
  "success": true,
  "message": "Full product sync queued for all operational locations (SH, BAR, ST999)",
  "locations": ["SH", "BAR", "ST999"],
  "branchCode": "ZOMBA"
}
```

### 6. **Wait 30 Seconds and Check Logs**
- All batches sent
- All locations visible in location breakdown
- No "CRITICAL: products batch X has Y products with missing LocationCode" errors

### 7. **Verify Backend Data**
```sql
SELECT branchCode, locationCode, COUNT(*) as ProductCount
FROM "Product"
WHERE "branchCode" = 'ZOMBA'
GROUP BY branchCode, locationCode
ORDER BY locationCode;
```

Expected output:
```
ZOMBA | BAR    | 800
ZOMBA | SH     | 1200
ZOMBA | ST999  | 600
```

---

## Rollback Plan

If issues occur after deployment:

### Quick Rollback
```bash
cd "Zomba POS Sync Agent"
rm -rf pos-sync-agent
mv pos-sync-agent.backup.2026-05-04 pos-sync-agent
cd pos-sync-agent
npm start
```

### If Backend Data Corrupted
1. Restore Product table from backup
2. Run manual full-sync after backup restore
3. Verify location breakdown in logs

---

## Key Differences: Blantyre vs Zomba (After Fix)

| Aspect | Blantyre | Zomba |
|--------|----------|-------|
| **Locations** | 1 (SH) | 3 (SH, BAR, ST999) |
| **Product Fetch** | Single query | Loop per location (3 queries) |
| **LocationCode Handling** | Hardcoded to SH | Fetched from POS per location |
| **Payload LocationCode** | Always SH (correct for single location) | Validated from product, no fallback (correct for multi-location) |
| **Retry Logic** | No (not needed - rarely fails) | Yes, up to 2 attempts per batch (needed due to complexity) |
| **Manual Sync** | Not implemented | Available via POST /pos-sync/force-full-sync |
| **Batch Location Breakdown** | Not logged | Logged per batch |

---

## Verification Checklist

- [ ] Code changes committed to main branch
- [ ] Zomba agent restarted
- [ ] Startup logs show: "Operational locations configured: SH, BAR, ST999"
- [ ] First AUTO SYNC cycle logs all 3 locations with product counts
- [ ] Manual sync endpoint `/pos-sync/force-full-sync` returns 200 OK
- [ ] Batch logs show location breakdown (SH: X, BAR: Y, ST999: Z)
- [ ] Backend Products table has entries for all 3 Zomba locations
- [ ] Admin Products panel filters work for each location
- [ ] Emergency Sale search works for Zomba locations
- [ ] Blantyre products remain unaffected

---

## Commit Information

**Commit Hash:** fd641fa  
**Message:** fix: Zomba product sync critical issues - LocationCode preservation and batch retry  
**Files Changed:**
- `Zomba POS Sync Agent/pos-sync-agent/server.js`
  - Fixed LocationCode fallback to require explicit location
  - Added batch validation for missing LocationCode
  - Enhanced logging (startup config, batch breakdown)
  - Implemented batch retry logic (2 attempts)
  - Added manual full-sync endpoint `/pos-sync/force-full-sync`

---

## Support

If sync continues to fail after deployment:

1. **Check agent logs for errors:**
   ```
   [ZOMBA SYNC] CRITICAL: products batch X has Y products with missing LocationCode
   ```
   → Indicates product fetch/enrichment bug in POS data

2. **Verify backend connectivity:**
   ```bash
   curl -H "x-pos-secret: MySuperSecret123" http://localhost:5000/health
   ```

3. **Check if AUTO SYNC is running:**
   ```bash
   # If stuck with "Skipped tick - previous cycle still running"
   # → Previous fetch/send is hanging
   # → Check POS database connectivity or network to backend
   ```

4. **Verify POS location codes match Zomba config:**
   ```
   .env: POS_OPERATIONAL_LOCATION_CODES=SH,BAR,ST999
   ```
   → Must match actual LocationCode values in POS database

---

**This fix ensures Zomba POS product sync is as reliable and trustworthy as Blantyre.**
