# Goods Intake Movement Ledger Fix - Testing & Verification Guide

## Overview
The Stock Movement Ledger has been enhanced to properly show Goods Intake movements with the following improvements:

1. **Improved Web Goods Intake Detection** - Now reliably captures all finalized intake records
2. **POS GRN Infrastructure** - Prepared backend for future POS-synced stock movements
3. **Better Diagnostics** - Enhanced logging to identify missing or unexpected movements

## What Changed

### Backend Service: `inventoryActivity.service.js`

#### 1. Enhanced `getIntakeMovements()` Function
**Before Issues:**
- Limited to 2000 items
- May not have proper location scoping
- Sorting only by item creation, not finalization time

**After Fixes:**
- ✅ Now retrieves up to 5000 items
- ✅ Comprehensive location filtering (branchCode + locationCode + locationId)
- ✅ Sorted by `finalizedAt` (primary), then `createdAt` (secondary)
- ✅ Includes branchCode and status in returned data
- ✅ Detailed console logging for diagnostics

**Query Improvements:**
```javascript
// Location filter properly applied to goodsIntake
goodsIntakeFilter: {
  ...locationFilter,  // Includes branchCode, locationCode, locationId
  status: { not: 'draft' },
  finalizedAt: { gte: period.startDate, lte: period.endDate }
}

// Proper sorting
orderBy: [
  { goodsIntake: { finalizedAt: 'asc' } },   // By finalization time
  { createdAt: 'asc' }                        // Then by line creation
]
```

#### 2. New `getPOSGRNMovements()` Function
**Purpose:** Placeholder for future POS-synced stock movements

**Current Status:**
- Returns empty array (POS GRN data not yet synced)
- Logs diagnostic explanation to console
- Documents three implementation approaches

**Documents Three Paths Forward:**
1. **POS Agent Webhook**: Agent pushes approved GRN records to backend API
2. **Direct SQL Connection**: Backend queries POS database directly
3. **Batch Import**: Manual or scheduled GRN import endpoint

**Future Data Expected:**
```javascript
{
  grnNo: "GRN_20260512-001",
  grnDate: DateTime,
  locationCode: "SH",
  branchCode: "BLANTYRE",
  supplierCode: "001",
  items: [
    { productCode, productName, quantity, unitCost, status: 'approved'|'posted' }
  ]
}
```

#### 3. Ledger Output Enhancements
**New Fields in Ledger Rows:**
- `branchCode` - Now included for intake movements
- `status` - Intake status (finalized, posted, etc.)

## Testing Guide

### Test 1: Verify Web Goods Intake Shows in Ledger

**Setup:**
1. Go to Business Operations → Stock Intake tab
2. Create a new goods intake (if none exists)
3. Add products and quantities
4. **Important:** Finalize the intake (click "Finalize Intake")
5. Note the date and intake reference number

**Test:**
1. Navigate to Stock Movement Ledger
2. Select the **same date** the intake was finalized
3. Select the **same branch/location** as the intake
4. Filter by a product from that intake
5. Look for `STOCK_INTAKE` movement rows

**Expected Result:**
- ✅ Row appears with `movementType: STOCK_INTAKE`
- ✅ `referenceNo` matches the intake reference
- ✅ `qtyIn` equals the quantity added
- ✅ `qtyOut` equals 0
- ✅ `balanceAfterTransaction` increased correctly
- ✅ Running balance shows correct cumulative total

### Test 2: Verify Multiple Products in Single Intake

**Setup:**
1. Create a goods intake with 3+ different products
2. Add varying quantities (e.g., 10, 50, 200)
3. Finalize the intake

**Test:**
1. Open the Ledger on the finalization date
2. Select one of the products from the intake
3. Observe all movement rows for that product

**Expected Result:**
- ✅ Each product appears as a separate movement row
- ✅ All rows dated at the finalized time
- ✅ Balance After Transaction updates correctly for each movement
- ✅ Final balance accounts for all additions

### Test 3: Verify Previous Days' Intakes

**Setup:**
1. Use existing goods intake records from previous dates
2. Ensure they have `status != 'draft'` and `finalizedAt` populated

**Test:**
1. Open Ledger
2. Select a date from 3-7 days ago
3. Filter by a product that should have an intake

**Expected Result:**
- ✅ Old intake movements appear
- ✅ Balances are correct for that historical date
- ✅ No missing movements

### Test 4: Verify Balance Calculations

**Setup:**
1. Select a date with both Sales and Intake movements
2. Note the Opening Balance for a product

**Test:**
1. Check ledger rows in chronological order
2. Manually calculate running balance:
   - Start: Opening Balance
   - After each sale: Subtract qtyOut
   - After each intake: Add qtyIn
3. Compare manual calculation to Ledger Balance After Transaction

**Expected Result:**
- ✅ Each row's `balanceAfterTransaction` matches manual calculation
- ✅ Closing Balance = Opening + Total Intakes - Total Sales

### Test 5: Check Diagnostic Logging

**Setup:**
1. Open browser Developer Console (F12)
2. Look at browser Network tab for API request to `/api/business-operations/inventory-activity-ledger`
3. Check server logs

**Test:**
1. Open Ledger with a specific location
2. Look for console messages starting with `[INVENTORY_ACTIVITY_SERVICE]` or `[INVENTORY LEDGER]`

**Expected Messages:**
```
[INVENTORY_ACTIVITY_SERVICE] getIntakeMovements filters: {...}
[INVENTORY LEDGER] Movements fetched: { sales: N, intakes: M, emergencySales: O, adjustments: 0, posGrn: 0 }
[INVENTORY LEDGER] Intake movements summary: { "BLANTYRE/SH": 15, "ZOMBA/BAR": 3 }
```

**If Intakes Missing:**
```
⚠️ NO INTAKE MOVEMENTS FOUND
Check that Goods Intake records exist with status != draft and finalizedAt within period
```

## Troubleshooting

### Issue: "No Intake Movements Found" in Logs

**Cause:** Goods Intake records don't have `finalizedAt` populated or status is still 'draft'

**Solution:**
1. Check GoodsIntake table:
   ```sql
   SELECT id, intakeRef, status, finalizedAt, locationCode, branchCode
   FROM goods_intakes
   WHERE branchCode = 'BLANTYRE' AND locationCode = 'SH'
   AND status != 'draft'
   LIMIT 20;
   ```
2. Ensure `status` is 'finalized', 'posted', or similar (not 'draft')
3. Ensure `finalizedAt` has a valid timestamp (not NULL)

### Issue: Intakes Show But Balances Are Wrong

**Possible Causes:**
1. Multiple movements on same timestamp - sorting order may matter
2. Opening balance calculation includes intakes after period start

**Debug Steps:**
1. Check the `orderBy` in logs - should be by `finalizedAt` then `createdAt`
2. Verify opening balance formula:
   - Should = current stock + (qtyOut in period) - (qtyIn in period)

### Issue: Old/Previous Days' Intakes Not Showing

**Cause:** Query filters may be too restrictive

**Check:**
1. Verify ledger date range includes the intake date
2. Verify location filter matches intake's `branchCode` + `locationCode`
3. Confirm intake status is not 'draft'
4. Check logs for location filter mismatches

## POS GRN Implementation (Future)

### When POS GRN Data Becomes Available

The system will automatically show POS_GRN movements once one of these is implemented:

**Option 1: POS Agent Webhook Push**
```javascript
// POS Agent calls this endpoint with approved GRNs
POST /api/business-operations/sync-pos-grn
{
  grnNo: "GRN_20260512-001",
  grnDate: "2026-05-12T14:30:00Z",
  locationCode: "SH",
  branchCode: "BLANTYRE",
  items: [
    { productCode: "2501", quantity: 100 }
  ]
}
```

**Option 2: Direct POS Database Connection**
```javascript
// Backend queries POS database for approved stock intakes
SELECT * FROM [POS].dbo.[stocks_temp]
WHERE GRNDate >= @startDate AND GRNDate <= @endDate
AND LocationCode = @locationCode
```

**Option 3: Manual GRN Import**
- Admin uploads GRN CSV/Excel
- System creates synced GRN records

### Testing POS GRN When Available

Once implemented, test POS_GRN movements similarly to STOCK_INTAKE:
1. Look for `movementType: POS_GRN` in ledger
2. Verify `referenceNo` matches GRN number
3. Confirm `qtyIn` shows received quantity
4. Ensure balance calculations include POS intakes

## Console Log Reference

### Diagnostic Logs in Browser Console

**When opening ledger with specific location:**
```
[INVENTORY_ACTIVITY_SERVICE] getIntakeMovements filters: {
  period: { start: "2026-05-12T00:00:00.000+02:00", end: "2026-05-12T23:59:59.999+02:00" },
  locationFilter: { branchCode: "BLANTYRE", locationCode: "SH" },
  goodsIntakeFilter: { branchCode: "BLANTYRE", locationCode: "SH", status: { not: "draft" }, finalizedAt: {...} },
  productFilter: "applied" | "none"
}
```

**Movement fetching summary:**
```
[INVENTORY LEDGER] Movements fetched: { 
  sales: 42, 
  intakes: 5, 
  emergencySales: 0, 
  adjustments: 0, 
  posGrn: 0 
}
```

**Intake breakdown by location:**
```
[INVENTORY LEDGER] Intake movements summary: {
  "BLANTYRE/SH": 15,
  "ZOMBA/BAR": 3,
  "ZOMBA/ST999": 2
}
```

**Opening balance calculation:**
```
[OPENING BALANCE] Product: { 
  productCode: "2501", 
  productName: "NIVEA Q10", 
  branchCode: "BLANTYRE", 
  locationCode: "SH" 
}, PeriodStart: "2026-05-12T00:00:00.000Z", Calculation: {
  latestStockBalance: 150,
  totalQtyOutInSelectedPeriod: 45,
  totalQtyInInSelectedPeriod: 20,
  openingBalance: 175
}
```

## Success Criteria

✅ All of the following should be true:

- [ ] Web Goods Intake movements appear in ledger on finalization date
- [ ] Each intake line appears as separate STOCK_INTAKE row
- [ ] Qty In matches added quantities exactly
- [ ] Qty Out is 0 for all intake movements
- [ ] Balance increases after intake rows
- [ ] Previous days' intakes still appear when selected
- [ ] Multiple products in single intake each get their own row
- [ ] Console logs show proper location filtering
- [ ] No "NO INTAKE MOVEMENTS FOUND" warnings when intakes exist
- [ ] Sales and intakes combined in correct chronological order
- [ ] Ledger includes branchCode in movement data

## Next Steps

1. **Immediate:** Test with existing goods intakes as described above
2. **Monitor:** Check console logs for diagnostic messages
3. **Report:** If any movements are missing, note:
   - Date of missing intake
   - Branch and location
   - Product codes
   - Expected quantity
4. **POS GRN:** When ready to sync POS stock, refer to "POS GRN Implementation" section

## Related Documentation

- [Goods Intake Tab User Guide](./GOODS_INTAKE_TAB_USER_GUIDE.md)
- [Stock Movement Ledger Documentation](./STOCK_MOVEMENT_LEDGER_DOCUMENTATION.md)
- [POS Sync Agent Documentation](./POS_SYNC_SYSTEM.md)
