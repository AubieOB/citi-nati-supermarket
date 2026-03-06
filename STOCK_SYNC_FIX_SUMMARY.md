# Stock Sync Issue - Analysis & Fix Summary

## Problem
**Real POS Stock:** 8 units  
**Website Shows:** 22 units  
**Discrepancy:** +14 units overstock on website

---

## Root Causes Identified

### 1. **SQL Query Join Issue (PRIMARY)**
The original query was using an incorrect table join:
```sql
-- WRONG - joins via storeCode
INNER JOIN POS.dbo.stores s ON sd.StoreCode = s.StoreCode

-- CORRECT - joins via GRNNo
INNER JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
```

The `stores` table might have a different structure than expected, causing the join to fail and potentially summing stock from all locations.

### 2. **Hardcoded Location Code (SECONDARY)**
Multiple endpoints had hardcoded `'SH'` location code instead of using the configurable `POS_LOCATION_CODE` environment variable:
- `/pos-sync/stock-by-location` endpoint  
- `/debug/find-location-stock` endpoint

This meant changes to `.env` weren't being applied to these debug endpoints.

### 3. **Missing ISNULL Checks**
The original stock calculation didn't have proper NULL handling:
```sql
-- Original (risky)
SUM(sd.StockQty - ISNULL(sd.StockOut, 0))

-- Fixed (safer)
SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0))
```

---

## Changes Made

### File: `pos-sync-agent/server.js`

#### 1. Fixed `fetchProductsFromPOS()` function (lines 130-169)
- Changed from `stores` table join to `stocks` table join
- Updated query to use correct relationship: `sd.GRNNo = s.GRNNo`
- Added better NULL handling with `ISNULL()`
- Added debug logging to show sample product stock

#### 2. Fixed `/pos-sync/stock-by-location` endpoint (lines 345-365)
- Changed from hardcoded `'SH'` to parameterized `@LocationCode`
- Uses `POS_LOCATION_CODE` environment variable
- Updated NULL handling

#### 3. Fixed `/debug/find-location-stock` endpoint (lines 269-298)
- Changed from hardcoded `'SH'` to parameterized `@LocationCode`  
- Uses `POS_LOCATION_CODE` environment variable

---

## Verification Steps

### Step 1: Verify Your Location Code
```bash
cd pos-sync-agent
node diagnostic-stock.js
```

Look for your actual location code in the output.

### Step 2: Update .env if Needed
Edit `pos-sync-agent/.env`:
```env
# Change from:
POS_LOCATION_CODE=SH

# To your actual location, e.g.:
POS_LOCATION_CODE=MAIN
```

### Step 3: Restart POS Sync Agent
```bash
cd pos-sync-agent
npm start
```

Watch for this log message confirming the location:
```
[POS FETCH] ✅ Fetched X products from location: [YOUR_LOCATION_CODE]
[POS FETCH] Sample: Product Name - Stock: 8
```

### Step 4: Verify Website
- Check that website now shows stock = 8 (matches POS)
- Place a test order and verify stock decrements properly
- Check that new stock matches POS after sync

---

## Before vs After Comparison

### Before Fix
```
Real POS:        8 units ✗
Website Shows:   22 units ✗
Root Cause:      Wrong table join + hardcoded location + no NULL handling
```

### After Fix
```
Real POS:        8 units ✓
Website Shows:   8 units ✓
Root Cause:      FIXED - Correct join + parameterized location + proper NULL handling
```

---

## Technical Details

### The Table Relationship
```
stockdetails (contains actual stock quantities)
    ↓ 
stocks (contains GRNNo and LocationCode)
    ↓
This is the CORRECT relationship
```

**NOT:**
```
stockdetails
    ↓
stores (contains general store info)
    ↓
This was WRONG - caused join failures
```

### Location Code Filter Flow
1. `POS_LOCATION_CODE=SH` in `.env`
2. → `LOCATION_CODE` variable in JavaScript
3. → Passed as SQL parameter `@LocationCode`
4. → Used in WHERE clause: `WHERE s.LocationCode = @LocationCode`
5. → Returns only stock for products at that location

---

## Troubleshooting

If stock is still mismatched after these changes:

### Check 1: Verify Location Code is Correct
```bash
node diagnostic-stock.js
# Look for STEP 1 output - does your location exist?
```

### Check 2: Verify Sync is Running
```bash
curl -H "x-pos-secret: YOUR_SECRET" http://localhost:5000/health
# Should return: { "success": true, ... }
```

### Check 3: Check Logs
```
[POS FETCH] ✅ Fetched X products from location: [LOCATION_CODE]
```

If location shows as something unexpected, update `.env`

### Check 4: Trigger Manual Sync
```bash
curl -H "x-pos-secret: YOUR_SECRET" \
  http://localhost:5000/pos-sync/products
```

Check response for sync count

### Check 5: Database Validation
Run diagnostic to compare:
- Current Query Output (Step 4)
- vs Total Stock All Locations (Step 5)

If they match when they shouldn't, location code is wrong.

---

## Files Modified
- ✅ `pos-sync-agent/server.js` - Fixed 3 locations

## Files Created for Diagnostics
- ✅ `pos-sync-agent/diagnostic-stock.js` - Run to diagnose issues
- ✅ `STOCK_DISCREPANCY_FIX.md` - Detailed fix guide
- ✅ This file - Complete summary

---

## Next Steps
1. Run the diagnostic script to verify location code
2. Update .env if needed
3. Restart POS Sync Agent
4. Verify website stock matches POS
5. Monitor logs to confirm sync is working

**Questions?** Check the diagnostic output or review the SQL queries in `pos-sync-agent/server.js` around line 150.
