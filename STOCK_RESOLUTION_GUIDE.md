# Stock Quantity Sync Issue - Complete Resolution Guide

## 🔍 What Was Wrong

Your POS system shows:
- **Real Stock:** 8 units of a product
- **Website Shows:** 22 units of the same product
- **Difference:** Website is showing 14 extra units (incorrect)

### Root Causes Found:

1. **Wrong SQL Query Join** ❌
   - Original: Joined via `stores` table (unreliable)
   - Fixed: Now joins via `stocks` table (correct)
   - Impact: Stock from ALL locations was being summed instead of filtering by your location

2. **Hardcoded Location Code** ❌  
   - Original: Location code was hardcoded as `'SH'` in query
   - Fixed: Now uses parameterized `POS_LOCATION_CODE` from `.env`
   - Impact: Changes to `.env` weren't being respected

3. **Missing NULL Handling** ❌
   - Original: `SUM(sd.StockQty - ISNULL(sd.StockOut, 0))`
   - Fixed: `SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0))`
   - Impact: NULL values could cause calculation errors

---

## ✅ What I Fixed

All three issues have been corrected in `pos-sync-agent/server.js`:

### Fix #1: Updated `fetchProductsFromPOS()` Function
```javascript
// Now uses correct join:
INNER JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo

// With proper NULL handling:
SUM(ISNULL(sd.StockQty, 0) - ISNULL(sd.StockOut, 0))

// With parameterized location:
WHERE s.LocationCode = @LocationCode
```

### Fix #2: Updated `/pos-sync/stock-by-location` Endpoint
- Removed hardcoded `'SH'`
- Now uses `@LocationCode` parameter
- Respects `POS_LOCATION_CODE` in `.env`

### Fix #3: Updated `/debug/find-location-stock` Endpoint
- Removed hardcoded `'SH'`
- Now uses `@LocationCode` parameter
- Consistent with main query

---

## 🚀 Implementation Steps

### Step 1: Identify Your Actual Location Code

Run this diagnostic script to find your real location code:

```bash
cd c:\citi-nati-supermarket\pos-sync-agent
node diagnostic-stock.js
```

This will show:
- All available locations in your POS database
- Stock quantities per location
- Which location has stock = 8 (your real stock)

**Write down your location code.** Examples: `MAIN`, `SH`, `WAREHOUSE`, `LOC1`

### Step 2: Update .env Configuration

Edit `pos-sync-agent/.env`:

```bash
# BEFORE
POS_LOCATION_CODE=SH

# AFTER - Replace 'MAIN' with your actual location code
POS_LOCATION_CODE=MAIN
```

**Important:** Your location code is case-sensitive in the POS database!

### Step 3: Restart POS Sync Agent

```bash
# Stop the current process (Ctrl+C if running)
# Then restart:
cd c:\citi-nati-supermarket\pos-sync-agent
npm start
```

**Watch the console output. You should see:**
```
[POS FETCH] ✅ Fetched 150 products from location: MAIN
[POS FETCH] Sample: Product Name - Stock: 8
```

If you see location `SH` instead of your actual location, update `.env` again.

### Step 4: Verify on Website

1. Open your website
2. Check the product that had 22 units
3. It should now show **8 units** ✓
4. Place a test order (1 unit)
5. Stock should become **7 units** ✓

---

## 📊 Sync Flow (After Fix)

```
Real POS Database (Stock: 8)
    ↓
POS Sync Agent Queries
    ✓ Correct table join (stocks)
    ✓ Correct location filter
    ✓ Proper NULL handling
    ↓
Sends to Backend API: { stock: 8 }
    ↓
Backend Updates Database
    ↓
Website Shows: 8 units ✓
```

---

## 🔧 Technical Details

### The Fix in Detail

**Original Query Problem:**
```sql
-- WRONG - Can't find stores reliably
INNER JOIN POS.dbo.stores s ON sd.StoreCode = s.StoreCode
WHERE s.LocationCode = @LocationCode
```

**Fixed Query:**
```sql
-- CORRECT - Direct join to stocks table
INNER JOIN POS.dbo.stocks s ON sd.GRNNo = s.GRNNo
WHERE s.LocationCode = @LocationCode
```

The `stocks` table contains the actual location code, while `stores` might not have the same structure. By joining directly to `stocks`, we ensure we're filtering by the actual location where stock is recorded.

### Environment Variable Usage

```javascript
// In Node.js
const LOCATION_CODE = process.env.POS_LOCATION_CODE || 'SH';

// In SQL Query
const request = pool.request();
request.input('LocationCode', sql.VarChar(10), LOCATION_CODE);
const result = await request.query(query);

// In SQL
WHERE s.LocationCode = @LocationCode
```

This ensures any change to `.env` is immediately reflected in the queries.

---

## ✓ Verification Checklist

- [ ] Ran diagnostic script and found my location code
- [ ] Updated `.env` with correct location code
- [ ] Restarted POS Sync Agent
- [ ] Checked console logs for correct location code
- [ ] Website now shows correct stock (8 not 22)
- [ ] Placed test order and stock decremented correctly
- [ ] New stock value matches POS after sync

---

## 🆘 Troubleshooting

### Issue: Website still shows 22 units

**Solution 1: Wrong location code**
- Run diagnostic again
- Find the location with stock = 8
- Update `.env` with that code
- Restart agent

**Solution 2: Sync not running**
- Check if POS Sync Agent is running
- Run: `curl -H "x-pos-secret: YOUR_SECRET" http://localhost:5000/health`
- Should return: `{"success": true, ...}`

**Solution 3: Check logs**
```
[POS FETCH] ✅ Fetched X products from location: YOUR_LOCATION
[POS FETCH] Sample: Product - Stock: 8
```

If logs show wrong location, update `.env`

### Issue: Diagnostic script shows error

- Verify SQL Server is running
- Verify `.env` has correct DB credentials
- Check firewall/network access to SQL Server

### Issue: Still seeing 22 after restart

- Verify cache is cleared on website (hard refresh: Ctrl+Shift+R)
- Check if sync is actually running (check logs)
- Verify location code is correct in POS database

---

## 📋 Files Modified

| File | Changes | Status |
|------|---------|--------|
| `pos-sync-agent/server.js` | Fixed 3 queries, added logging | ✅ |
| `pos-sync-agent/.env` | Update location code | ⏳ You do this |

## 📄 Documentation Created

| File | Purpose |
|------|---------|
| `STOCK_FIX_QUICK_START.md` | Quick reference (this page) |
| `STOCK_SYNC_FIX_SUMMARY.md` | Detailed technical summary |
| `STOCK_DISCREPANCY_FIX.md` | Original analysis doc |
| `diagnostic-stock.js` | Tool to diagnose the issue |

---

## ⏱️ Expected Timeline

- **Step 1 (Diagnostic):** 2-3 minutes
- **Step 2 (Update .env):** 1 minute  
- **Step 3 (Restart):** 1 minute
- **Step 4 (Verify):** 2-3 minutes

**Total:** ~10 minutes to complete fix

---

## 🎯 Expected Result

✅ **Real POS:** 8 units  
✅ **Website:** 8 units  
✅ **Sync:** Automatic every 30 seconds  
✅ **Orders:** Stock decrements correctly  
✅ **Management:** No manual intervention needed  

---

## Questions?

1. **Where's my location code?** → Run `diagnostic-stock.js` in Step 1
2. **What if I have multiple locations?** → Use the location code where you're selling products
3. **How often does it sync?** → Every 30 seconds (configurable via `SYNC_INTERVAL_MS`)
4. **What if I need to change location later?** → Just update `.env` and restart agent

---

**Ready to proceed? Start with Step 1 above! 🚀**
