@echo off
REM 🧪 POS Sync Agent - Local Testing Script
REM This script tests all POS integration endpoints locally

setlocal enabledelayedexpansion

echo.
echo =====================================
echo   POS Agent - Local Testing Script
echo =====================================
echo.

REM Configuration
set POS_URL=http://localhost:3001
set POS_SECRET=test-secret-key-12345
set BACKEND_URL=http://localhost:5000

echo [TEST 1] Checking if POS Agent is running on port 3001...
echo.

timeout /t 1 /nobreak >nul

curl -s %POS_URL%/health > nul
if %errorlevel% equ 0 (
    echo ✅ POS Agent is running!
    echo.
) else (
    echo ❌ POS Agent is NOT running
    echo Start it with: cd pos-sync-agent && npm start
    echo.
    pause
    exit /b 1
)

REM Test 1: Health Check
echo [TEST 2] Testing health endpoint (no auth required)...
echo.
powershell -Command "Invoke-RestMethod -Uri '%POS_URL%/health' -Method Get | ConvertTo-Json"
echo.
pause

REM Test 2: Products with Auth
echo [TEST 3] Testing products endpoint (WITH auth)...
echo.
powershell -Command "^
    \$headers = @{'x-pos-secret' = '%POS_SECRET%'}; ^
    \$response = Invoke-RestMethod -Uri '%POS_URL%/pos-sync/products' -Headers \$headers -Method Get; ^
    Write-Host \"Found $(\$response.count) products\"; ^
    \$response | ConvertTo-Json -Depth 2
"
echo.
pause

REM Test 3: Products without Auth (should fail)
echo [TEST 4] Testing products endpoint (WITHOUT auth - should fail)...
echo.
powershell -Command "^
    try { ^
        Invoke-RestMethod -Uri '%POS_URL%/pos-sync/products' -Method Get; ^
    } catch { ^
        Write-Host \"Expected error: \"; ^
        Write-Host \$_.Exception.Response.StatusCode; ^
        Write-Host \$_.Exception.Message; ^
    }
"
echo.
pause

REM Test 4: Categories
echo [TEST 5] Testing categories endpoint...
echo.
powershell -Command "^
    \$headers = @{'x-pos-secret' = '%POS_SECRET%'}; ^
    \$response = Invoke-RestMethod -Uri '%POS_URL%/pos-sync/categories' -Headers \$headers -Method Get; ^
    Write-Host \"Found $(\$response.count) categories\"; ^
    \$response.data | Select-Object -First 5 | ConvertTo-Json
"
echo.
pause

REM Test 5: Stock by Location
echo [TEST 6] Testing stock-by-location endpoint...
echo.
powershell -Command "^
    \$headers = @{'x-pos-secret' = '%POS_SECRET%'}; ^
    \$response = Invoke-RestMethod -Uri '%POS_URL%/pos-sync/stock-by-location' -Headers \$headers -Method Get; ^
    Write-Host \"Found stock for $(\$response.count) products\"; ^
    \$response.data | Select-Object -First 3 | ConvertTo-Json
"
echo.
pause

REM Test 6: Backend Connection
echo [TEST 7] Testing backend products endpoint...
echo.
curl -s %BACKEND_URL%/api/products > nul
if %errorlevel% equ 0 (
    echo ✅ Backend is responding
    powershell -Command "^
        \$response = Invoke-RestMethod -Uri '%BACKEND_URL%/api/products' -Method Get; ^
        Write-Host \"Backend has $(\$response.products.Count) products in database\"
    "
) else (
    echo ❌ Backend is not responding
    echo Make sure backend is running: cd citi-nati-backend && npm run dev
)
echo.
pause

REM Summary
echo.
echo =====================================
echo   Testing Complete!
echo =====================================
echo.
echo Results Summary:
echo [✅] All tests can run locally
echo.
echo Next Steps:
echo 1. Keep all 3 services running (POS Agent, Backend, Frontend)
echo 2. Open http://localhost:5173 in browser
echo 3. Navigate to /products page
echo 4. Verify everything works
echo 5. Then deploy to Render
echo.

pause
