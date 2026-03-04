# 🚀 LOCAL TESTING - QUICK START

## 📋 Prerequisite Checklist

Before testing, verify you have:

- [ ] SQL Server running with POS database
- [ ] PostgreSQL running (for backend)
- [ ] Node.js installed (`node --version` should work)
- [ ] Your SQL Server credentials ready (DB_USER, DB_PASSWORD)
- [ ] 3 PowerShell/Command Prompt windows available

---

## 🎯 QUICK START: 5 Minutes Setup

### Terminal 1: Start POS Sync Agent

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"

# First time only: install dependencies
npm install

# Edit .env with your SQL Server credentials
notepad .env
```

Update `.env`:
```env
DB_SERVER=localhost
DB_DATABASE=POS
DB_USER=webuser
DB_PASSWORD=YOUR_PASSWORD_HERE
PORT=5000
POS_SECRET=test-secret-key-12345
```

Then start it:
```powershell
npm start
```

✅ Should show:
```
Database connection pool established
POS Sync Agent listening on port 5000
```

---

### Terminal 2: Start Backend

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\citi-nati-backend"

# First time only
npm install

# Make sure .env has:
# ENABLE_POS_SYNC=true
# POS_AGENT_URL=http://localhost:5000
# POS_SECRET=test-secret-key-12345
notepad .env

# Start
npm run dev
```

✅ Should show:
```
✓ Listening on http://localhost:5000
```

---

### Terminal 3: Start Frontend

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\citi-nati-frontend"

# First time only
npm install

# Start
npm run dev
```

✅ Should show:
```
  VITE v4.3.9  local:   http://localhost:5173/
```

---

## 🧪 Test the Integration

### Quick PowerShell Test

```powershell
# Open a new PowerShell window and run:

# Test 1: POS Agent health
curl http://localhost:5000/health

# Test 2: Get products from POS
$headers = @{"x-pos-secret" = "test-secret-key-12345"}
Invoke-RestMethod `
    -Uri "http://localhost:5000/pos-sync/products" `
    -Headers $headers | ConvertTo-Json

# Test 3: Get products from backend
curl http://localhost:5000/api/products

# Test 4: Trigger sync (need admin token)
# First log in to get token, then:
$token = "your-admin-token"
$headers = @{"Authorization" = "Bearer $token"}
Invoke-RestMethod `
    -Uri "http://localhost:5000/api/products/sync/pos" `
    -Headers $headers `
    -Method Post | ConvertTo-Json
```

### Test in Browser

1. Open: `http://localhost:5173`
2. Navigate to `/products`
3. Verify products load
4. Check stock quantities
5. Try adding to cart

---

## 📊 Test Results

Use this checklist to verify everything works:

| Component | Test | Expected | Status |
|-----------|------|----------|--------|
| **POS Agent** | `npm start` | Connects to SQL Server | ✅ / ❌ |
| **POS Health** | `curl localhost:5000/health` | `{"success": true}` | ✅ / ❌ |
| **POS Products** | With `x-pos-secret` header | Returns products array | ✅ / ❌ |
| **POS Auth** | Without header | Returns 401 | ✅ / ❌ |
| **Backend** | `npm run dev` | Listening on 5000 | ✅ / ❌ |
| **Backend Products** | `GET /api/products` | Returns products | ✅ / ❌ |
| **Backend Sync** | `POST /api/products/sync/pos` | Returns synced count | ✅ / ❌ |
| **Frontend** | `npm run dev` | Listening on 5173 | ✅ / ❌ |
| **Products Page** | Load `/products` | Products display | ✅ / ❌ |
| **Add to Cart** | Click add to cart | Works without errors | ✅ / ❌ |

---

## 🐛 Quick Troubleshooting

### "Cannot connect to SQL Server"
```powershell
# Check SQL Server is running
Get-Service MSSQL* | Select-Object Name, Status

# Test connection
sqlcmd -S localhost -U sa -P YourPassword -Q "SELECT @@VERSION"
```

### "Port 5000 already in use"
```powershell
# Find process
netstat -ano | findstr :5000

# Kill it
taskkill /PID <PID> /F
```

### "Cannot find module"
```powershell
npm install
```

### "Backend can't reach POS Agent"
```powershell
# Verify POS Agent is running
curl http://localhost:5000/health

# Check POS_AGENT_URL in .env
# Should be: http://localhost:5000
```

### "Products not syncing"
```sql
-- Check POS database has products
SELECT COUNT(*) FROM POS.dbo.productsmaster WHERE Active = 1;
```

---

## 🎯 Success Indicators

✅ **You're successful when:**

1. POS Agent logs show: "Connected to SQL Server"
2. Health endpoint returns `{"success": true}`
3. Products endpoint returns product list
4. Backend logs show no errors
5. Products appear on `/products` page
6. Add to cart works
7. No console errors (F12)

---

## 📁 Key Locations

```
POS Agent:          c:\...\pos-sync-agent
Backend:            c:\...\citi-nati-backend
Frontend:           c:\...\citi-nati-frontend

POS Agent .env:     pos-sync-agent\.env
Backend .env:       citi-nati-backend\.env
Frontend .env:      citi-nati-frontend\.env.production

Test Script:        pos-sync-agent\TEST_LOCALLY.ps1
Testing Guide:      LOCAL_TESTING_GUIDE.md
```

---

## 🚀 What's Next

Once all tests pass:

1. Stop all 3 services (Ctrl+C)
2. Verify code is committed to Git
3. Follow: `DEPLOYMENT_CHECKLIST_FINAL.md`
4. Deploy to Render
5. Update Render environment variables
6. Verify on production

---

## ⏱️ Expected Time

| Task | Time |
|------|------|
| Install deps | 3 min |
| Start POS Agent | 1 min |
| Start Backend | 1 min |
| Start Frontend | 1 min |
| Run tests | 10 min |
| Verify in browser | 5 min |
| **Total** | **~20 min** |

---

## 🔔 Important Notes

1. **Keep all 3 services running** during testing
   - POS Agent on port 5000
   - Backend on port 5000
   - Frontend on port 5173

2. **Test in this order:**
   1. POS Agent (standalone)
   2. Backend (with POS Agent)
   3. Frontend (with both)

3. **Use exact secret key:**
   - All 3 use: `test-secret-key-12345`
   - Change before production

4. **Check logs for errors:**
   - POS Agent: Terminal 1
   - Backend: Terminal 2
   - Frontend: Terminal 3

---

## ✅ Ready to Start?

Follow this order:

1. **Terminal 1:** Start POS Agent (`npm start`)
2. Wait 2 seconds for connection
3. **Terminal 2:** Start Backend (`npm run dev`)
4. Wait 2 seconds for startup
5. **Terminal 3:** Start Frontend (`npm run dev`)
6. Wait 2 seconds for Vite to load
7. Open browser: `http://localhost:5173`
8. Navigate to `/products`
9. Test everything

If everything works → Great! Time to deploy to Render.

If something fails → Check `LOCAL_TESTING_GUIDE.md` for detailed troubleshooting.

---

**Good luck! 🚀**

Need help? Open `LOCAL_TESTING_GUIDE.md` for the complete guide.
