# Stock Quantity Discrepancy - Root Cause Analysis & Fix

## Problem Summary
- **Real POS stock:** 8 units
- **Website shows:** 22 units
- **Difference:** +14 units (overstock on website)

## Root Cause
The stock synchronization is likely **pulling from multiple locations instead of just your actual selling location**, OR the location code configuration is incorrect.

### Location Code Issue
In `pos-sync-agent/.env`:
```
POS_LOCATION_CODE=SH
```

**This needs to be verified** - it may not match your actual POS location code.

## Diagnostic Steps

### Step 1: Run the Diagnostic Script
```bash
cd pos-sync-agent
node diagnostic-stock.js
```

This will show:
1. All available locations and their codes in your POS database
2. Stock quantities per location
3. What the current query returns
4. Total stock if aggregating all locations

### Step 2: Identify Your Correct Location Code
From the diagnostic output, note the actual `LocationCode` you're using.

### Step 3: Update .env with Correct Code
Replace `SH` with your actual location code, e.g.:
```
POS_LOCATION_CODE=MAIN_STORE
```

## The Query Issue

Current query (with location filter):
```sql
SELECT SUM(sd.StockQty - ISNULL(sd.StockOut, 0))
FROM POS.dbo.stockdetails sd
INNER JOIN POS.dbo.stores s ON sd.StoreCode = s.StoreCode
WHERE sd.ProductCode = p.ProductCode
AND s.LocationCode = @LocationCode
```

**Problem:** If `@LocationCode` doesn't match ANY store, the INNER JOIN returns 0 rows, and `SUM(NULL)` becomes 0.

But then somewhere, all stock is being summed instead, which is why you see 22 (8+14 from other locations).

## Solution

### Option 1: Use Correct Location Code (Recommended)
1. Run `diagnostic-stock.js` 
2. Find your correct location code
3. Update `POS_LOCATION_CODE` in `.env`
4. Restart the POS Sync Agent

### Option 2: Add Location Logging
Edit `pos-sync-agent/server.js` to add more debugging:

```javascript
// Before the query
console.log(`[DEBUG] Using location code: ${LOCATION_CODE}`);
console.log(`[DEBUG] Product sample: ${products.slice(0, 2)}`);
```

### Option 3: Check if Multiple Locations Should Be Summed
If you actually WANT to sum stock from all locations, remove the `LocationCode` filter:

```javascript
// Change this:
AND s.LocationCode = @LocationCode

// To sum all locations:
-- (remove the location filter entirely)
```

## Verification

After making changes:

1. **Restart POS Sync Agent:**
   ```bash
   # Kill any running instance
   # Then start fresh
   npm start
   ```

2. **Trigger a manual sync:**
   ```bash
   curl -H "x-pos-secret: YOUR_SECRET" http://localhost:5000/pos-sync/products
   ```

3. **Check website** - stock should now match POS

4. **Monitor logs:**
   ```
   [POS FETCH] Fetched from location: [YOUR_LOCATION_CODE]
   [POS SYNC] Received X products
   ```

## Expected Behavior After Fix

1. POS real stock: 8 units
2. Website shows: 8 units  ✅
3. Both stay in sync

---

**Next Step:** Run the diagnostic script and share the output to identify the correct location code!
