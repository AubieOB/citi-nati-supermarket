@echo off
REM Script to build all Electron desktop apps for Windows
REM Run from project root: build-all-apps.bat

echo.
echo ============================================
echo Citi-Nati Desktop Apps - Build All
echo ============================================
echo.

REM Build frontend first
echo [1/4] Building frontend...
cd citi-nati-frontend
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed!
    exit /b 1
)
cd ..

REM Build Admin App
echo.
echo [2/4] Building Admin Desktop App...
cd desktop-apps\admin
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Admin app build failed!
    cd ..\..
    exit /b 1
)
cd ..\..

REM Build Cashier App
echo.
echo [3/4] Building Cashier Desktop App...
cd desktop-apps\cashier
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Cashier app build failed!
    cd ..\..
    exit /b 1
)
cd ..\..

REM Build Driver App
echo.
echo [4/4] Building Driver Desktop App...
cd desktop-apps\driver
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Driver app build failed!
    cd ..\..
    exit /b 1
)
cd ..\..

echo.
echo ============================================
echo ✓ All builds completed successfully!
echo ============================================
echo.
echo Installers located in:
echo   - desktop-apps\admin\release\
echo   - desktop-apps\cashier\release\
echo   - desktop-apps\driver\release\
echo.
pause
