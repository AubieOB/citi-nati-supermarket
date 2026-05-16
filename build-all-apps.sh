#!/bin/bash
# Script to build all Electron desktop apps for Unix/Linux/macOS
# Run from project root: ./build-all-apps.sh

set -e  # Exit on any error

echo ""
echo "============================================"
echo "Citi-Nati Desktop Apps - Build All"
echo "============================================"
echo ""

# Build frontend first
echo "[1/4] Building frontend..."
cd citi-nati-frontend
npm run build
cd ..

# Build Admin App
echo ""
echo "[2/4] Building Admin Desktop App..."
cd desktop-apps/admin
npm install
npm run build
cd ../..

# Build Cashier App
echo ""
echo "[3/4] Building Cashier Desktop App..."
cd desktop-apps/cashier
npm install
npm run build
cd ../..

# Build Driver App
echo ""
echo "[4/4] Building Driver Desktop App..."
cd desktop-apps/driver
npm install
npm run build
cd ../..

echo ""
echo "============================================"
echo "✓ All builds completed successfully!"
echo "============================================"
echo ""
echo "Installers located in:"
echo "  - desktop-apps/admin/release/"
echo "  - desktop-apps/cashier/release/"
echo "  - desktop-apps/driver/release/"
echo ""
