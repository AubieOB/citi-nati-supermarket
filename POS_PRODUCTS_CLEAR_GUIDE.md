# POS Products Clear Guide

This guide explains how to delete all POS synced products from your database and restart fresh syncing.

**Why clear POS products?**
- Start with a clean slate for testing
- Remove any duplicates or corrupted data
- Verify fresh sync works without legacy data interference
- Improve database performance by removing old/test data

---

## ✅ Recommended Approach: API Endpoint (EASIEST)

### Step 1: Get Admin Auth Token
First, log into your admin account on the live website and get your JWT token:
- Open browser DevTools (F12)
- Go to **Console** tab
- Paste: `localStorage.getItem('token')`
- Copy the token value (it starts with `eyJ...`)

### Step 2: Call the Clear Endpoint
```bash
curl -X DELETE https://citi-nati-backend.onrender.com/api/products/pos-sync/clear \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
{
  "success": true,
  "message": "Deleted 1500 POS products",
  "deletedCount": 1500
}
```

### Step 3: Restart POS Agent
```powershell
cd "C:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
npm start
```

Watch the agent logs - it will start syncing fresh products 🚀

---

## Alternative 1: Node Script (FOR BACKEND ENVIRONMENT)

### Step 1: Run Clear Script
From your backend directory:
```bash
cd citi-nati-backend
node clear-pos-products.js
```

**Output:**
```
📦 POS PRODUCTS CLEAR SCRIPT
================================

📊 Current database state:
   Total products: 1509
   POS products (with sourceCode): 1500
   Admin products: 9

🗑️  Deleting all POS synced products...

✅ Successfully deleted 1500 POS products

📊 Database after deletion:
   Total products: 9
   Admin products remaining: 9

✨ POS products cleared successfully!
💡 You can now restart the POS Agent to sync fresh products.
```

### Step 2: Restart POS Agent
```powershell
cd "C:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
npm start
```

---

## Alternative 2: Direct SQL Query (FOR ADVANCED USERS)

Only use this if you have direct database access.

### Via Render Dashboard (EASIEST SQL METHOD):
1. Go to https://dashboard.render.com
2. Select **citi-nati-backend** service
3. Click **Data** tab
4. Click **PostgreSQL** database
5. Click **Query** button
6. Paste this SQL:
```sql
DELETE FROM "Product" WHERE "sourceCode" IS NOT NULL;
```
7. Click **Execute**

### Via Command Line (psql):
```bash
psql your_database_url -c 'DELETE FROM "Product" WHERE "sourceCode" IS NOT NULL;'
```

---

## Verification After Clear

### 1. Confirm Products Were Deleted
Check your website immediately after clearing - product count should drop significantly.

### 2. Restart POS Agent
```powershell
cd "C:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
npm start
```

### 3. Monitor Syncing
Watch for these console messages:
```
[POS AGENT] 🔄 Auto-sync triggered
[POS AGENT] 📦 Fetching from POS database...
[POS AGENT] ✅ Fetched 1500 products
[POS AGENT] 📤 Sending batch 1/8 (200 products)
[POS AGENT] ✅ Batch 1 synced successfully
```

### 4. Check Frontend
- Go to your website
- Refresh the page
- Products should appear fresh (no duplicates)
- Stock quantities should be accurate

### 5. Verify No Duplicates
Open browser DevTools console and check for messages like:
```
[PRODUCTS] 📦 Loaded 1500 products
[PRODUCTS] ✅ Deduplication: 1500 → 1500 (no duplicates)
[PRODUCTS] 📦 POS product update: YOGHURT (stock: 100)
```

---

## Troubleshooting

### "Connection refused" when trying to run script
- Ensure `.env` file has correct `DATABASE_URL`
- Check if Render PostgreSQL is accessible

### "Command not found: node"
- Make sure Node.js is installed: `node --version`
- If not, install from nodejs.org

### Products not syncing after clear
- Check POS Agent logs for errors
- Verify `x-pos-secret` header matches (MySuperSecret123)
- Ensure backend endpoint is accessible

### Still seeing duplicates
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh page (Ctrl+Shift+R)
- Check frontend deduplication logs in console

---

## What Gets Deleted

**Deleted (products with sourceCode):**
- All POS synced products
- ~1500 products from POS database

**NOT Deleted (without sourceCode):**
- Admin-created products
- Manually added products
- Test products without sourceCode

To delete ALL products including admin ones:
```sql
DELETE FROM "Product";
```

---

## Next Steps

1. ✅ Choose one method above to clear POS products
2. ✅ Restart POS Agent to sync fresh
3. ✅ Verify products appear without duplicates
4. ✅ Test search, filters, and categories
5. ✅ Monitor stock updates in real-time
6. ✅ Check dashboard for any sync errors

---

**Questions?**
- Check POS Agent logs: `npm start` in pos-sync-agent folder
- Check Backend logs: Render dashboard → Service → Logs
- Check Frontend console: F12 → Console tab

