@echo off
REM POS Sync Agent - API Test Script
REM Usage: test-api.bat

setlocal enabledelayedexpansion

REM Configuration
set BASE_URL=http://localhost:5000
set API_KEY=MySuperSecret123
set HEADER=-H "x-pos-secret: !API_KEY!"

echo ====================================
echo   POS Sync Agent - API Test
echo ====================================
echo.

REM Test 1: Health Check
echo [1] Testing Health Check (no auth required)...
echo URL: !BASE_URL!/health
echo.
curl !BASE_URL!/health
echo.
echo.

REM Test 2: Get Products
echo [2] Testing Products Endpoint
echo URL: !BASE_URL!/pos-sync/products
echo API Key: !API_KEY!
echo.
curl -H "x-pos-secret: !API_KEY!" !BASE_URL!/pos-sync/products
echo.
echo.

REM Test 3: Get Categories
echo [3] Testing Categories Endpoint
echo URL: !BASE_URL!/pos-sync/categories
echo API Key: !API_KEY!
echo.
curl -H "x-pos-secret: !API_KEY!" !BASE_URL!/pos-sync/categories
echo.
echo.

REM Test 4: Get Stock by Location
echo [4] Testing Stock by Location Endpoint (SH only)
echo URL: !BASE_URL!/pos-sync/stock-by-location
echo API Key: !API_KEY!
echo.
curl -H "x-pos-secret: !API_KEY!" !BASE_URL!/pos-sync/stock-by-location
echo.
echo.

echo ====================================
echo   All Tests Complete
echo ====================================
pause
