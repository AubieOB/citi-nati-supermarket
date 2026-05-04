# Zomba POS Sync - Quick Reference Guide

## One-Line Summary
**Fixed LocationCode fallback bug in Zomba agent that was collapsing BAR/ST999 products into SH namespace.**

---

## What Was Broken
- Zomba POS agent sent products without proper LocationCode
- Backend defaulted missing LocationCode to SH
- Result: All Zomba products marked as SH, overwriting real SH products
- Consequence: BAR and ST999 products disappeared after refresh

---

## What's Fixed
1. ✅ Products MUST have LocationCode before sending (or batch rejected)
2. ✅ LocationCode NO LONGER falls back to SH
3. ✅ Batches retry up to 2 times on failure
4. ✅ Batch location breakdown visible in logs
5. ✅ Manual sync endpoint: `POST /pos-sync/force-full-sync`
6. ✅ Comprehensive startup logging

---

## Quick Test

### After Agent Restart
```bash
# Should see in logs:
# [ZOMBA SYNC][BOOT] Operational locations configured: SH, BAR, ST999
# [ZOMBA SYNC] Fetched 1200 products from location SH
# [ZOMBA SYNC] Fetched 800 products from location BAR
# [ZOMBA SYNC] Fetched 600 products from location ST999
```

### Trigger Manual Sync
```bash
curl -X POST \
  -H "x-pos-secret: MySuperSecret123" \
  http://localhost:5000/pos-sync/force-full-sync
```

Expected: `"success": true` + "Full product sync queued..."

### Verify DB
```sql
SELECT branchCode, locationCode, COUNT(*) 
FROM "Product" 
WHERE "branchCode" = 'ZOMBA' 
GROUP BY branchCode, locationCode;
```

Expected:
```
ZOMBA | BAR    | 800
ZOMBA | SH     | 1200
ZOMBA | ST999  | 600
```

---

## Key Logs to Watch

| Log | Meaning | Action |
|-----|---------|--------|
| `[ZOMBA SYNC][BOOT] Operational locations: SH, BAR, ST999` | Startup OK | ✓ Normal |
| `[ZOMBA SYNC] Sending products batch 1/16 { SH: 35, BAR: 40, ST999: 25 }` | All locations in batch | ✓ Normal |
| `[ZOMBA SYNC] CRITICAL: products batch X has Y with missing LocationCode` | Data corruption bug | ❌ STOP - investigate POS fetch |
| `[ZOMBA SYNC] products synced (batch X/16, attempt 1/2)` | Batch success | ✓ Normal |
| `[ZOMBA SYNC] error (..., attempt 2/2): Connection timeout` | Transient error, retry | ✓ Normal - will retry |
| `[ZOMBA SYNC] batch X failed after 2 attempts` | Batch failed permanently | ⚠ Check network/backend |

---

## Common Issues

### Issue 1: Logs show "Skipped tick - previous cycle still running"
**Cause:** Previous fetch/send is hanging (stuck in progress)
**Fix:** 
- Check POS database connectivity
- Check network to backend server
- Restart agent if stuck > 2 minutes

### Issue 2: Batch location breakdown missing one location
E.g., `{ SH: 100, BAR: 100, ST999: 0 }`
**Cause:** ST999 has no products, or fetch failed for that location
**Fix:**
- Check POS database for ST999 products: `SELECT * FROM productsmaster WHERE LocationCode = 'ST999'`
- Check agent logs for fetch error: `[AUTO SYNC ERROR] Failed to fetch products from location ST999`

### Issue 3: Products still not appearing in backend
**Checklist:**
1. Are agent logs showing "products synced (batch X/Y)"? (Check = it sent)
2. Is backend receiving requests? (Check backend logs for POST /api/products/pos-sync/push)
3. Is backend accepting LocationCode? (Check for "ZOMBA STOCK GUARD" or "REJECTED" messages)
4. Is database storing them? (SQL query above)

---

## Rollback (If Needed)

```bash
# If things break badly:
cd "Zomba POS Sync Agent"
rm -rf pos-sync-agent
mv pos-sync-agent.backup.2026-05-04 pos-sync-agent
cd pos-sync-agent
npm start
```

---

## Files Changed
- `Zomba POS Sync Agent/pos-sync-agent/server.js` (128 lines added/modified)
- `ZOMBA_SYNC_FIX_COMPREHENSIVE.md` (documentation)

## Commit
- `fd641fa` - fix: Zomba product sync critical issues
- `578d2df` - docs: comprehensive fix documentation

---

## Support Contact
If sync fails after deployment, check logs for:
1. "CRITICAL: products batch" errors
2. "HTTP status: 5XX" errors  
3. "Connection refused" errors

Then review `ZOMBA_SYNC_FIX_COMPREHENSIVE.md` section "Support" for troubleshooting.
