@echo off
REM POS Sync Agent Startup Script for Windows
REM This batch file starts the POS Sync Agent with error checking

setlocal enabledelayedexpansion

echo.
echo ====================================
echo   POS Sync Agent - Starting...
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo ERROR: .env file not found
    echo Copy .env.example to .env and configure your settings
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Starting POS Sync Agent...
echo.

node server.js
pause
