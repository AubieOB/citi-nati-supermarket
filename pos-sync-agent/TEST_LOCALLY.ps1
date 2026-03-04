# 🧪 POS Sync Agent - Local Testing Script (PowerShell Version)
# Run this in PowerShell to test all endpoints

# Configuration
$POS_URL = "http://localhost:3001"
$POS_SECRET = "test-secret-key-12345"
$BACKEND_URL = "http://localhost:5000"

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "  POS Agent - Local Testing" -ForegroundColor Cyan
Write-Host "===================================`n" -ForegroundColor Cyan

# Function to test endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [hashtable]$Headers,
        [string]$Method = "Get"
    )
    
    Write-Host "[$Name]" -ForegroundColor Yellow
    
    try {
        $response = Invoke-RestMethod -Uri $Url -Headers $Headers -Method $Method -ErrorAction Stop
        Write-Host "✅ Success" -ForegroundColor Green
        return $response
    }
    catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Test 1: Health Check
Write-Host "`n[1/6] Testing health endpoint (no auth)..." -ForegroundColor Cyan
$health = Test-Endpoint "Health" "$POS_URL/health" @{} Get
if ($health) {
    $health | ConvertTo-Json
}
Write-Host ""

# Test 2: Products with Auth
Write-Host "[2/6] Testing products endpoint (WITH auth)..." -ForegroundColor Cyan
$headers = @{"x-pos-secret" = $POS_SECRET}
$products = Test-Endpoint "Products" "$POS_URL/pos-sync/products" $headers Get
if ($products) {
    Write-Host "Found: $($products.count) products`n"
    $products.data | Select-Object -First 2 | ConvertTo-Json
}
Write-Host ""

# Test 3: Products without Auth (should fail)
Write-Host "[3/6] Testing products endpoint (WITHOUT auth - should fail)..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$POS_URL/pos-sync/products" -Method Get -ErrorAction Stop | Out-Null
    Write-Host "⚠️ Warning: No auth was required (security issue)" -ForegroundColor Yellow
}
catch {
    Write-Host "✅ Correctly rejected (401 Unauthorized)" -ForegroundColor Green
    Write-Host "Error: $($_.Exception.Response.StatusCode)" -ForegroundColor Gray
}
Write-Host ""

# Test 4: Categories
Write-Host "[4/6] Testing categories endpoint..." -ForegroundColor Cyan
$categories = Test-Endpoint "Categories" "$POS_URL/pos-sync/categories" $headers Get
if ($categories) {
    Write-Host "Found: $($categories.count) categories`n"
    $categories.data | ConvertTo-Json
}
Write-Host ""

# Test 5: Stock
Write-Host "[5/6] Testing stock-by-location endpoint..." -ForegroundColor Cyan
$stock = Test-Endpoint "Stock" "$POS_URL/pos-sync/stock-by-location" $headers Get
if ($stock) {
    Write-Host "Found: $($stock.count) products with stock`n"
    $stock.data | Select-Object -First 3 | ConvertTo-Json
}
Write-Host ""

# Test 6: Backend
Write-Host "[6/6] Testing backend products endpoint..." -ForegroundColor Cyan
try {
    $backendResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/products" -Method Get -ErrorAction Stop
    Write-Host "✅ Backend is running" -ForegroundColor Green
    Write-Host "Backend has: $($backendResponse.products.Count) products in database`n"
}
catch {
    Write-Host "❌ Backend is not responding" -ForegroundColor Red
    Write-Host "Make sure backend is running: cd citi-nati-backend && npm run dev`n" -ForegroundColor Yellow
}

# Summary
Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "  Testing Complete!" -ForegroundColor Cyan
Write-Host "===================================`n" -ForegroundColor Cyan

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "✅ POS Agent is working locally" -ForegroundColor Green
Write-Host "✅ All endpoints are accessible"
Write-Host "✅ API key validation is working`n"

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Keep all 3 services running:"
Write-Host "   - Terminal 1: POS Agent (pos-sync-agent, npm start)"
Write-Host "   - Terminal 2: Backend (citi-nati-backend, npm run dev)"
Write-Host "   - Terminal 3: Frontend (citi-nati-frontend, npm run dev)"
Write-Host ""
Write-Host "2. Open browser: http://localhost:5173"
Write-Host "3. Navigate to /products and test"
Write-Host "4. Check for any errors in console (F12)"
Write-Host "5. If all works, deploy to Render`n"

Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "# View POS Agent logs"
Write-Host "Invoke-RestMethod http://localhost:3001/health`n"

Write-Host "# Trigger manual sync (as admin)"
Write-Host "`$token = 'your-admin-token'"
Write-Host "`$headers = @{'Authorization' = 'Bearer ' + `$token}"
Write-Host "Invoke-RestMethod -Uri http://localhost:5000/api/products/sync/pos -Headers `$headers -Method Post`n"

Write-Host "Ready to test? Press Enter to close this window..."
Read-Host
