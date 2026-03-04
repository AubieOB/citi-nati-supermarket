# ⚡ QUICK CLEAR POS PRODUCTS - 3 STEPS

## 🚀 FASTEST WAY (Recommended)

### Step 1: Get Your Admin Token
```powershell
# Open browser DevTools (F12) → Console tab
localStorage.getItem('token')
# Copy the long token string (starts with eyJ...)
```

### Step 2: Run This Command
```bash
curl -X DELETE https://citi-nati-backend.onrender.com/api/products/pos-sync/clear \
  -H "Authorization: Bearer PASTE_YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### Step 3: Restart POS Agent
```powershell
cd "C:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
npm start
```

✅ Done! Fresh products syncing in ~30 seconds.

---

## Alternative: Node Script
```bash
cd "C:\Users\aubre\Desktop\Citi-Nati Supermarket website\citi-nati-backend"
node clear-pos-products.js
```

---

## Alternative: Direct SQL (Render Dashboard)
1. Go to https://dashboard.render.com
2. Select **citi-nati-backend** → **Data** → **PostgreSQL Query**
3. Paste & Execute:
```sql
DELETE FROM "Product" WHERE "sourceCode" IS NOT NULL;
```

---

## Expected Results

**Before:**
```
📊 Total products: 1509
📊 POS products: 1500
📊 Admin products: 9
```

**After Clear:**
```
📊 Total products: 9
📊 Admin products: 9
```

**After POS Agent Restart (30 seconds):**
```
📊 Total products: 1509
📊 POS products: 1500 (fresh)
📊 Admin products: 9
```

---

✨ Website goes from 1509 → 9 → 1509 with zero duplicates!

