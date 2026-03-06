# ⚡ Quick Fix - Stock Quantity Discrepancy

## TL;DR
Your website shows **22 units** but POS has **8 units** because:
1. ❌ Wrong SQL table join in the sync query
2. ❌ Location code might be wrong (`SH` may not be your actual location)
3. ❌ Missing NULL handling in calculations

**I've fixed the queries.** Now you need to verify the location code.

---

## 🚀 Do This Now (3 Steps)

### Step 1: Run Diagnostic Script
```bash
cd c:\citi-nati-supermarket\pos-sync-agent
node diagnostic-stock.js
```

**Look at STEP 1 output.** What location codes do you see?

Example output:
```
LocationCode  StoreName
MAIN          Main Store
SH            Side Store
```

**Important:** What's YOUR location code? (Not 'SH' - your actual store location)

### Step 2: Update .env (if needed)
If your location code is NOT `SH`, edit `.env`:

```bash
# BEFORE
POS_LOCATION_CODE=SH

# AFTER - Replace with YOUR location code
POS_LOCATION_CODE=MAIN
```

### Step 3: Restart & Verify
```bash
# Kill any running instance and restart
npm start

# Watch for this in logs:
# [POS FETCH] ✅ Fetched X products from location: MAIN
# [POS FETCH] Sample: Product Name - Stock: 8
```

---

## ✅ How to Know It's Fixed

**Before:** Website = 22, POS = 8  
**After:** Website = 8, POS = 8 ✓

Then both stay in sync automatically.

---

## 📋 What I Fixed

| Issue | Fixed? | Details |
|-------|--------|---------|
| Wrong SQL join | ✅ | Changed from `stores` to `stocks` table |
| Hardcoded location | ✅ | Now uses `POS_LOCATION_CODE` from .env |
| Missing NULL checks | ✅ | Added proper ISNULL() handling |

---

## 🆘 Still Not Working?

1. **Check diagnostic output** - Did you find your location code?
2. **Verify .env updated** - Did you save the location code change?
3. **Check logs** - Does it show the correct location code?
4. **Review diagnostic Step 4 vs Step 5** - Should be different; if identical, location code is wrong

---

## Files You'll Need
- `pos-sync-agent/diagnostic-stock.js` - Run this to find location code
- `STOCK_SYNC_FIX_SUMMARY.md` - Detailed technical info
- `pos-sync-agent/.env` - Update location code here

**Run the diagnostic script first - it will tell you exactly what to do next!**
