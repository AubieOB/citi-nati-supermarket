# 🧪 LOCAL TESTING GUIDE - POS Integration

## Step-by-Step Testing Before Render Deployment

This guide walks you through testing the entire POS integration locally.

**Time Required:** 30-45 minutes
**Prerequisites:** 
- SQL Server running with POS database
- Node.js installed
- PowerShell or Command Prompt
- 3 terminal windows

---

## PHASE 1: Test POS Sync Agent (Windows)

### Step 1.1: Navigate to POS Agent

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
```

### Step 1.2: Install Dependencies

```powershell
npm install
```

**Expected output:**
```
added 50 packages in 5.2s
```

### Step 1.3: Create .env File

```powershell
Copy-Item .env.example .env
```

**Edit the .env file:**
```powershell
notepad .env
```

**Set your SQL Server credentials:**
```env
DB_SERVER=localhost
DB_DATABASE=POS
DB_USER=webuser
DB_PASSWORD=YourPassword123
PORT=5000
POS_SECRET=test-secret-key-12345
```

💡 **Tip:** Use your actual SQL Server credentials from your POS database

### Step 1.4: Start the POS Agent

```powershell
npm start
```

**Expected output:**
```
Database connection pool established
POS Sync Agent listening on port 5000
API Key validation: ENABLED
Database: localhost/POS
```

✅ **Success!** POS Agent is running on port 5000

---

## PHASE 2: Test POS Agent Endpoints

### Step 2.1: Test Health Check (New Terminal)

```powershell
# Should return success without auth
curl http://localhost:5000/health
```

**Expected response:**
```json
{
  "success": true,
  "message": "POS Sync Agent is running",
  "timestamp": "2026-03-04T14:32:00.000Z"
}
```

✅ Health check working!

### Step 2.2: Test Products Endpoint

```powershell
# Test with correct secret
$headers = @{
    "x-pos-secret" = "test-secret-key-12345"
}

$response = Invoke-RestMethod `
    -Uri "http://localhost:5000/pos-sync/products" `
    -Headers $headers `
    -Method Get

# Display response
$response | ConvertTo-Json -Depth 2
```

**Expected response:**
```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "ProductCode": "P001",
      "ProductName": "Cooking Oil 5L",
      "Barcode": "1234567890",
      "SellingPrice": 29.99,
      "QuantityAvailable": 50
    },
    ...
  ]
}
```

✅ Products endpoint working!

### Step 2.3: Test Without Auth (Should Fail)

```powershell
# Test without secret
curl http://localhost:5000/pos-sync/products
```

**Expected response:**
```json
{
  "success": false,
  "error": "Unauthorized: Missing x-pos-secret header"
}
```

✅ API key validation working!

### Step 2.4: Test with Wrong Auth (Should Fail)

```powershell
$headers = @{
    "x-pos-secret" = "wrong-secret"
}

Invoke-RestMethod `
    -Uri "http://localhost:5000/pos-sync/products" `
    -Headers $headers `
    -Method Get `
    -ErrorAction SilentlyContinue
```

**Expected error:**
```json
{
  "success": false,
  "error": "Unauthorized: Invalid API key"
}
```

✅ Auth validation working!

### Step 2.5: Test Categories Endpoint

```powershell
$headers = @{
    "x-pos-secret" = "test-secret-key-12345"
}

Invoke-RestMethod `
    -Uri "http://localhost:5000/pos-sync/categories" `
    -Headers $headers
```

**Expected:** Array of categories from POS database

✅ Categories endpoint working!

### Step 2.6: Test Stock Endpoint

```powershell
$headers = @{
    "x-pos-secret" = "test-secret-key-12345"
}

Invoke-RestMethod `
    -Uri "http://localhost:5000/pos-sync/stock-by-location" `
    -Headers $headers
```

**Expected:** Stock quantities by location

✅ Stock endpoint working!

---

## PHASE 3: Test Backend Integration

### Step 3.1: Configure Backend .env (New Terminal)

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\citi-nati-backend"
```

Edit or create `.env`:
```env
# Existing variables (should already be here)
DATABASE_URL=postgresql://user:password@localhost:5432/citi_nati
JWT_SECRET=your-jwt-secret
NODE_ENV=development

# NEW: POS Integration
ENABLE_POS_SYNC=true
POS_AGENT_URL=http://localhost:5000
POS_SECRET=test-secret-key-12345
```

✅ Backend env configured

### Step 3.2: Install Backend Dependencies

```powershell
npm install
```

### Step 3.3: Start Backend Server

```powershell
npm run dev
```

**Expected output:**
```
[Prisma] No schema migrations to apply
✓ Listening on http://localhost:5000
```

✅ Backend running!

---

## PHASE 4: Test Sync Endpoint

### Step 4.1: Get Admin Token (New Terminal)

First, log in as admin to get a token:

```powershell
# Test login
$loginData = @{
    email = "admin@example.com"
    password = "admin-password"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
    -Uri "http://localhost:5000/api/auth/login" `
    -Method Post `
    -Body $loginData `
    -ContentType "application/json"

# Extract token
$adminToken = $loginResponse.token
Write-Host "Admin token: $adminToken"
```

💡 **Note:** Use your actual admin credentials

### Step 4.2: Test Sync Endpoint

```powershell
# Trigger sync from POS
$headers = @{
    "Authorization" = "Bearer $adminToken"
    "Content-Type" = "application/json"
}

$syncResponse = Invoke-RestMethod `
    -Uri "http://localhost:5000/api/products/sync/pos" `
    -Method Post `
    -Headers $headers

$syncResponse | ConvertTo-Json
```

**Expected response:**
```json
{
  "success": true,
  "message": "Products synced successfully",
  "synced": 150,
  "skipped": 0,
  "total": 150
}
```

✅ Sync endpoint working!

### Step 4.3: Verify Products in Database

```powershell
# Get products from backend
$productsResponse = Invoke-RestMethod `
    -Uri "http://localhost:5000/api/products" `
    -Method Get

# Show count and first product
Write-Host "Total products: $($productsResponse.products.Count)"
$productsResponse.products[0] | ConvertTo-Json
```

**Expected:** Products with sourceCode field (from POS)

✅ Products synced to database!

---

## PHASE 5: Test Frontend Integration

### Step 5.1: Start Frontend (New Terminal)

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\citi-nati-frontend"
```

### Step 5.2: Install Dependencies

```powershell
npm install
```

### Step 5.3: Start Dev Server

```powershell
npm run dev
```

**Expected output:**
```
  VITE v4.3.9  local:   http://localhost:5173/
```

✅ Frontend running!

### Step 5.4: Test in Browser

Open browser and navigate to:
```
http://localhost:5173/products
```

**Verify:**
- [ ] Products load from backend
- [ ] Product prices display
- [ ] Stock quantities show
- [ ] Add to cart works
- [ ] No console errors (F12 to check)

✅ Frontend working!

---

## FULL TESTING CHECKLIST

### Phase 1: POS Agent ✅
- [ ] `npm start` connects to SQL Server
- [ ] Logs show "Connected to SQL Server"
- [ ] Listening on port 5000

### Phase 2: POS Endpoints ✅
- [ ] GET /health returns success without auth
- [ ] GET /pos-sync/products returns products with auth
- [ ] Missing auth header returns 401
- [ ] Wrong auth returns 401
- [ ] GET /pos-sync/categories works
- [ ] GET /pos-sync/stock-by-location works

### Phase 3: Backend Integration ✅
- [ ] .env configured with POS variables
- [ ] Backend starts without errors
- [ ] All env vars loaded

### Phase 4: Backend Sync ✅
- [ ] Admin can log in and get token
- [ ] POST /api/products/sync/pos returns success
- [ ] Synced count > 0
- [ ] GET /api/products returns synced products
- [ ] Products have sourceCode field

### Phase 5: Frontend ✅
- [ ] Frontend loads without errors
- [ ] /products page loads
- [ ] Products display
- [ ] Stock quantities accurate
- [ ] No console errors

---

## 🐛 TROUBLESHOOTING

### "Cannot connect to SQL Server"

**Error in POS Agent:**
```
ConnectionError: Connection lost
```

**Fix:**
```powershell
# 1. Verify SQL Server is running
Get-Service MSSQL* | Select-Object Name, Status

# 2. Test connection manually
sqlcmd -S localhost -U sa -P YourPassword -Q "SELECT @@VERSION"

# 3. Check credentials in .env
notepad .env

# 4. Restart POS Agent
# Stop (Ctrl+C) and run: npm start
```

### "Port 5000 already in use"

**Error:**
```
listen EADDRINUSE :::5000
```

**Fix:**
```powershell
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or change PORT in .env and restart
```

### "Module not found: mssql"

**Error:**
```
Cannot find module 'mssql'
```

**Fix:**
```powershell
cd pos-sync-agent
npm install
npm start
```

### "401 Unauthorized"

**Error:**
```json
{"error": "Unauthorized: Invalid API key"}
```

**Fix:**
```powershell
# 1. Verify secret matches
# Check .env in pos-sync-agent

# 2. Check header in request
# "x-pos-secret" should match exactly

# 3. No spaces around the key!
```

### "Products endpoint returns empty"

**Expected:** `"count": 0, "data": []`

**Fix:**
```sql
-- Check POS database directly
SELECT COUNT(*) FROM POS.dbo.productsmaster WHERE Active = 1;
SELECT COUNT(*) FROM POS.dbo.productprices WHERE LocationCode = 'SH';
SELECT COUNT(*) FROM POS.dbo.StocksReport WHERE LocationCode = 'SH';

-- If count is 0, add test data or check location code (should be 'SH')
```

### "Backend can't reach POS Agent"

**Error in Backend Logs:**
```
[POS Sync] Error: ECONNREFUSED
```

**Fix:**
```powershell
# 1. Verify POS Agent is running
curl http://localhost:5000/health

# 2. Check POS_AGENT_URL in backend .env
# Should be: http://localhost:5000

# 3. Check if ports are correct
netstat -ano | findstr :5000
netstat -ano | findstr :5000

# 4. Restart both services
```

### "Sync endpoint returns 401"

**Error:**
```json
{"error": "Unauthorized"}
```

**Fix:**
```powershell
# 1. Get valid admin token
$loginResponse = Invoke-RestMethod `
    -Uri "http://localhost:5000/api/auth/login" `
    -Method Post `
    -Body (@{email="admin@example.com"; password="password"} | ConvertTo-Json) `
    -ContentType "application/json"

# 2. Use token in Authorization header
$headers = @{
    "Authorization" = "Bearer $($loginResponse.token)"
}
```

### "Frontend shows no products"

**Fix:**
```javascript
// Open F12 (Developer Tools)
// Check Console for errors

// Test backend API directly:
fetch('http://localhost:5000/api/products')
  .then(r => r.json())
  .then(data => console.log(data))

// Should show products
```

---

## 📊 TEST RESULTS FORM

Use this to document your test results:

```
Date: _______________
Tester: _______________

POS AGENT TESTS:
✓ Installed dependencies: YES / NO
✓ .env configured: YES / NO
✓ Connected to SQL Server: YES / NO
✓ Health endpoint works: YES / NO
✓ Products endpoint works: YES / NO
✓ Auth validation works: YES / NO

BACKEND TESTS:
✓ .env configured: YES / NO
✓ Server started: YES / NO
✓ Admin login works: YES / NO
✓ Sync endpoint works: YES / NO
✓ Synced products count: _______
✓ Products in database: YES / NO

FRONTEND TESTS:
✓ Dev server started: YES / NO
✓ Products page loads: YES / NO
✓ Products display: YES / NO
✓ Add to cart works: YES / NO
✓ No console errors: YES / NO

OVERALL: ✓ PASS / ✗ FAIL

Issues found:
_____________________________________
_____________________________________

Ready for Render deployment: YES / NO
```

---

## 🎯 TESTING SUMMARY

**All tests should take ~45 minutes:**

| Phase | Component | Time | Status |
|-------|-----------|------|--------|
| 1 | POS Agent Setup | 5 min | ⏳ |
| 2 | POS Endpoints | 10 min | ⏳ |
| 3 | Backend Setup | 10 min | ⏳ |
| 4 | Backend Sync | 10 min | ⏳ |
| 5 | Frontend | 10 min | ⏳ |

---

## ✅ NEXT STEPS

After all tests pass:

1. ✅ Press Ctrl+C to stop all servers
2. ✅ Verify code changes are committed to Git
3. ✅ Follow `DEPLOYMENT_CHECKLIST_FINAL.md`
4. ✅ Deploy to Render
5. ✅ Configure Render environment variables
6. ✅ Run final verification on Render

---

## 🎉 READY TO TEST?

Start with **PHASE 1: Step 1.1** above!

Keep this guide open in another window as you test.

**Need help?** Check the troubleshooting section above.

---

**Happy testing! 🚀**
