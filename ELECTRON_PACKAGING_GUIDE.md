# Electron Desktop Apps - Packaging & Deployment Guide

## Build Configuration Overview

Each desktop app (`admin`, `cashier`, `driver`) uses `electron-builder` for packaging. The configuration is defined in each app's `package.json`.

---

## 🏗️ Build Process

### Prerequisites
```bash
# All desktop apps need Electron installed
cd desktop-apps/admin && npm install
cd desktop-apps/cashier && npm install
cd desktop-apps/driver && npm install
```

### Build Frontend First
```bash
# Build the shared React codebase
cd citi-nati-frontend
npm run build
# Output: dist/
```

### Build Desktop App
```bash
# From within app folder
cd desktop-apps/admin
npm run build  # Creates .exe, .msi on Windows

# Or platform-specific builds:
npm run build:win    # Windows only
npm run build:mac    # macOS only
npm run build:linux  # Linux only
```

### Output Structure
```
desktop-apps/
├── admin/
│   └── release/
│       ├── Citi-Nati-Admin 1.0.0.exe      # Installer
│       └── Citi-Nati Admin 1.0.0.exe      # Portable
├── cashier/
│   └── release/
│       ├── Citi-Nati-Cashier 1.0.0.exe
│       └── Citi-Nati Cashier 1.0.0.exe
└── driver/
    └── release/
        ├── Citi-Nati-Driver 1.0.0.exe
        └── Citi-Nati Driver 1.0.0.exe
```

---

## 📋 Build Configuration Details

### electron-builder Settings

#### Windows (NSIS Installer)
```json
{
  "win": {
    "target": ["nsis", "portable"],
    "certificateFile": null,
    "certificatePassword": null
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

**Features:**
- NSIS: Traditional Windows installer (Add/Remove Programs integration)
- Portable: Standalone .exe (no installation required)
- Allows custom install directory
- Creates Start Menu shortcuts
- Creates Desktop shortcut

#### macOS
```json
{
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.business"
  }
}
```

**Features:**
- DMG: Drag-and-drop installer
- ZIP: Direct archive distribution
- App Store category classification

#### Linux
```json
{
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Utility"
  }
}
```

**Features:**
- AppImage: Universal Linux app image
- DEB: Debian/Ubuntu package format

---

## 🔐 Code Signing (Production)

### Windows Code Signing
```javascript
// In package.json build config:
{
  "win": {
    "certificateFile": "path/to/certificate.pfx",
    "certificatePassword": "password"
  }
}
```

**Steps:**
1. Obtain Windows code signing certificate ($100-300/year)
2. Convert to .pfx format
3. Add to deployment secrets (GitHub Actions, CI/CD)
4. electron-builder automatically signs during build

### macOS Notarization
```javascript
{
  "mac": {
    "identity": "Developer ID Application",
    "notarize": {
      "teamId": "YOUR_TEAM_ID"
    }
  }
}
```

**Steps:**
1. Enroll in Apple Developer Program ($99/year)
2. Create notarization credentials
3. electron-builder handles notarization automatically
4. Required for distribution on macOS

---

## 🔄 Auto-Update System (Optional)

### Implementation Steps

1. **Set up Update Server**
   ```javascript
   // Use electron-updater
   const { autoUpdater } = require('electron-updater');
   
   autoUpdater.checkForUpdatesAndNotify();
   ```

2. **GitHub Releases Distribution**
   - Create GitHub release with app binary
   - electron-updater checks latest release
   - Auto-downloads and installs updates

3. **Custom Server**
   - Host update metadata on your server
   - electron-updater polls custom URL
   - More control over rollout

---

## 📊 Version Management

### Semantic Versioning
```
1.0.0
│ │ └─ Patch (bug fixes, security)
│ └─── Minor (new features, backward compatible)
└───── Major (breaking changes)
```

### Version Updates
```bash
# In package.json
{
  "version": "1.0.0"  // Update before build
}

# In electron main process:
const { app } = require('electron');
console.log(app.getVersion()); // Returns 1.0.0
```

### Frontend Sync
- Keep frontend version in sync with Electron apps
- All 4 versions should match: web, admin, cashier, driver
- Use git tags for release tracking

---

## 🚀 CI/CD Integration (GitHub Actions)

### Build and Release Workflow

```yaml
name: Build Desktop Apps

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      # Build frontend
      - name: Build Frontend
        run: |
          cd citi-nati-frontend
          npm install
          npm run build
      
      # Build each app
      - name: Build Admin App
        run: |
          cd desktop-apps/admin
          npm install
          npm run build
      
      - name: Build Cashier App
        run: |
          cd desktop-apps/cashier
          npm install
          npm run build
      
      - name: Build Driver App
        run: |
          cd desktop-apps/driver
          npm install
          npm run build
      
      # Upload artifacts
      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: releases-${{ matrix.os }}
          path: 'desktop-apps/*/release/**'
      
      # Create GitHub Release
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: 'desktop-apps/*/release/**'
```

---

## 📦 Distribution Strategies

### Strategy 1: Direct Download
- Host installers on website
- Users download .exe/.dmg/.deb
- Manual update checks
- **Best for**: In-house deployment, company devices

### Strategy 2: GitHub Releases
- Push releases to GitHub
- electron-updater checks releases
- Auto-downloads and notifies users
- Free hosting on GitHub
- **Best for**: Open source, public distribution

### Strategy 3: Custom Update Server
- Host update metadata JSON
- Custom versioning logic
- Rollout scheduling
- A/B testing capability
- **Best for**: Large deployments, staged rollouts

### Strategy 4: App Stores
- Microsoft Store (Windows)
- Mac App Store
- Snap Store (Linux)
- **Best for**: Consumer distribution, visibility

---

## 🧪 Testing Before Release

### Pre-Release Checklist
```bash
# 1. Update version numbers
# - package.json in root
# - desktop-apps/admin/package.json
# - desktop-apps/cashier/package.json
# - desktop-apps/driver/package.json

# 2. Test all functionality
npm run dev  # Test in dev mode

# 3. Build installers
npm run build

# 4. Test installers
# - Install each app
# - Verify functionality
# - Test uninstall/reinstall
# - Verify no errors in console

# 5. Test updates
# - Simulate version bump
# - Test auto-update detection

# 6. Security review
# - Check for hardcoded secrets
# - Verify preload script restrictions
# - Audit dependencies
```

---

## 🚨 Common Issues & Solutions

### Issue: App won't start
**Solution**: Check main.js preload path
```javascript
preload: path.join(__dirname, '../../electron/preload.js')
```

### Issue: API calls fail
**Solution**: Verify API_URL environment variable
```bash
REACT_APP_API_URL=https://your-api.com
```

### Issue: Installer not created
**Solution**: Ensure dist/ exists from frontend build
```bash
cd citi-nati-frontend && npm run build
```

### Issue: Code signing fails
**Solution**: Verify certificate file and password
```bash
# Windows
certificateFile: "path/to/cert.pfx"
certificatePassword: "your_password"
```

---

## 📝 Release Checklist

- [ ] Update version in all package.json files
- [ ] Update CHANGELOG
- [ ] Test web app still works perfectly
- [ ] Test dev mode: `npm run electron:admin:dev`
- [ ] Build all apps: `npm run build`
- [ ] Test all installers
- [ ] Verify API connectivity
- [ ] Check for console errors
- [ ] Verify authentication works
- [ ] Test all 3 roles (admin, cashier, driver)
- [ ] Create GitHub release
- [ ] Upload installers
- [ ] Announce release to users
- [ ] Monitor for error reports

---

## 🔄 Rollback Procedure

If critical bug is found in release:

1. **Stop distribution** - Remove from GitHub, website
2. **Fix bug** in main codebase
3. **Decrement version** or create patch
4. **Rebuild and test**
5. **Re-release** with new version
6. **Notify users** - Use in-app notification system

---

## 📚 Additional Resources

- **electron-builder**: https://www.electron.build/
- **electron-updater**: https://github.com/electron-userland/electron-updater
- **Code Signing**: https://www.electron.build/code-signing
- **macOS Notarization**: https://www.electron.build/code-signing#macos

---

**Last Updated**: May 16, 2026  
**Status**: Preparation Phase - Ready for Phase 2 Integration
