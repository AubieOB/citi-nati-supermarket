# Citi-Nati Electron Desktop Apps - Integration Strategy & Architecture

**Project Status**: Safe Preparation Phase (Non-Breaking)  
**Date**: May 16, 2026  
**Goal**: Prepare Citi-Nati for Electron desktop packaging without affecting current production web system

---

## ✅ Current System Status

### Frontend (Citi-Nati Web App)
- **Framework**: React 18 + Vite
- **Routing**: React Router v6 with role-based pages
- **Auth**: JWT-based via AuthContext
- **Structure**: 
  - `/pages/public/*` - Public pages (Home, Products, Checkout, etc.)
  - `/pages/admin/*` - Admin dashboard
  - `/pages/cashier/*` - Cashier POS
  - `/pages/driver/*` - Driver delivery dashboard

### Backend API
- **Endpoint**: `http://localhost:5000` (dev) or VPS (production)
- **Auth Method**: JWT tokens in Authorization header
- **Scope System**: Branch/location-based access control
- **POS Sync**: Independent agent system (unchanged)

### Architecture
- Single React codebase serves all user roles
- Authentication determines which routes are accessible
- No role-specific build variants currently exist

---

## 🎯 Desktop Apps Planned

### 1. **Citi-Nati Admin Desktop**
- **Purpose**: Full system management
- **Routes**: `/admin` and all sub-routes
- **Users**: System administrators
- **Window**: Full-size (1280x1024 default)
- **Build Output**: `citi-nati-admin-desktop.exe`

### 2. **Citi-Nati Cashier Desktop**
- **Purpose**: POS checkout system
- **Routes**: `/cashier` and all sub-routes
- **Users**: Cashiers
- **Window**: Optimized for touch/POS (1280x768)
- **Build Output**: `citi-nati-cashier-desktop.exe`

### 3. **Citi-Nati Driver Desktop**
- **Purpose**: Order delivery tracking
- **Routes**: `/driver` and all sub-routes
- **Users**: Delivery drivers
- **Window**: Full-size with map integration
- **Build Output**: `citi-nati-driver-desktop.exe`

---

## 🏗️ Electron Architecture

### Design Principles

1. **Single Codebase, Multiple Wrappers**
   - Share 100% of React frontend code
   - Share 100% of backend API integration
   - Different Electron entry points per app
   - Different app icons, menus, window configs

2. **Non-Breaking Preparation**
   - No changes to web app logic
   - No changes to authentication
   - No changes to database
   - No changes to POS sync agents
   - Electron files completely isolated

3. **Secure IPC Communication**
   - Preload script isolates main/renderer processes
   - Context isolation enabled (Electron security best practice)
   - Node integration disabled
   - Sandbox enabled

4. **Future-Proof Structure**
   - Easy to add Android/mobile apps later
   - Configuration abstraction for environment changes
   - Scalable multi-app architecture

---

## 📁 Folder Structure

```
citi-nati-supermarket/
├── electron/                           # SHARED Electron utilities
│   ├── constants.js                    # App constants, IPC channels, URLs
│   ├── preload.js                      # Secure IPC bridge
│   ├── main-process-template.js        # Template for main process
│   ├── vite.config.template.js         # Vite config template
│   ├── useElectron.hook.template.js    # React hook for Electron APIs
│   └── .env.template                   # Environment template
│
├── desktop-apps/                       # Desktop applications
│   ├── admin/                          # Admin Desktop App
│   │   ├── src/
│   │   │   └── main.js                 # Electron entry point
│   │   ├── public/                     # App-specific assets
│   │   └── package.json                # App-specific dependencies
│   │
│   ├── cashier/                        # Cashier Desktop App
│   │   ├── src/
│   │   │   └── main.js
│   │   ├── public/
│   │   └── package.json
│   │
│   └── driver/                         # Driver Desktop App
│       ├── src/
│       │   └── main.js
│       ├── public/
│       └── package.json
│
├── citi-nati-frontend/                 # UNCHANGED - Web + Desktop apps
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── cashier/
│   │   │   ├── driver/
│   │   │   └── public/
│   │   ├── context/
│   │   ├── components/
│   │   └── hooks/
│   ├── package.json                    # Web app deps
│   └── vite.config.js                  # Web app vite config
│
└── citi-nati-backend/                  # UNCHANGED - Single API
    └── ...
```

---

## 🔄 How It Works

### Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Developer: npm run dev (from citi-nati-frontend/)           │
│  Vite dev server starts at http://localhost:3000            │
└─────────────────────────────────────────────────────────────┘

From root: npm run electron:admin:dev
  ↓
desktop-apps/admin/src/main.js starts
  ↓
Electron window opens and navigates to http://localhost:3000/admin
  ↓
React app loads same code as web, but in Electron context
  ↓
useElectron() hook can access electron APIs via IPC
```

### Production Build Flow

```
Frontend Build: npm run build (from citi-nati-frontend/)
  ↓ Output: citi-nati-frontend/dist/
  ↓

Desktop Build: npm run build (from desktop-apps/admin/)
  ↓ electron-builder packages app
  ↓ Includes: main.js + dist/ + electron/utils
  ↓ Output: release/Citi-Nati-Admin-1.0.0.exe
```

---

## 🔐 Security Model

### Preload Script (electron/preload.js)
- **Purpose**: Secure bridge between main & renderer processes
- **Exposed APIs**: Window controls, auth, sync, notifications
- **Blocked**: Direct Node.js/fs access, eval(), require()
- **Benefits**: Prevents XSS attacks from compromising system

### Context Isolation
- Renderer process cannot access main process directly
- All communication via IPC with validation
- No global access to Node.js modules
- Sandbox enabled

### Token Storage
- Tokens NOT stored in localStorage (XSS risk)
- Request tokens from main process via IPC
- Main process uses secure storage (keytar, electron-store)
- Production should upgrade to OS-level secure storage

---

## 🚀 Implementation Roadmap

### Phase 1: Preparation (CURRENT ✓)
- [x] Create folder structure
- [x] Create configuration templates
- [x] Create preload script
- [x] Create IPC channels
- [x] Update .gitignore
- [x] Document architecture

### Phase 2: Frontend Integration (FUTURE)
- [ ] Copy useElectron hook to citi-nati-frontend/src/hooks/
- [ ] Add `isElectron` detection to components
- [ ] Create Electron-specific window controls (optional)
- [ ] Update API configuration for Electron
- [ ] Test web app still works 100%

### Phase 3: App Packaging (FUTURE)
- [ ] Install Electron in each desktop-apps folder
- [ ] Customize icons per app
- [ ] Configure electron-builder for each app
- [ ] Test dev mode: npm run electron:admin:dev
- [ ] Build installers for Windows/Mac/Linux

### Phase 4: Deployment (FUTURE)
- [ ] Create GitHub releases
- [ ] Auto-update system
- [ ] Installer signing (Windows code signing)
- [ ] macOS notarization
- [ ] User installer distribution

---

## 📋 Safest Next Steps

### 1. Copy React Hook to Frontend
```bash
cp electron/useElectron.hook.template.js \
   citi-nati-frontend/src/hooks/useElectron.js
```

### 2. Create Environment Files
```bash
cp electron/.env.template desktop-apps/admin/.env
cp electron/.env.template desktop-apps/cashier/.env
cp electron/.env.template desktop-apps/driver/.env
```

### 3. Install Electron (Per App)
```bash
cd desktop-apps/admin
npm install
# Repeat for cashier, driver
```

### 4. Test Dev Mode (First Time)
```bash
# Terminal 1: Start web dev server
cd citi-nati-frontend
npm run dev

# Terminal 2: Start admin Electron app
cd desktop-apps/admin
npm run dev
```

### 5. Verify Web App Still Works
- Web app at http://localhost:3000 should work identically
- All routes /admin, /cashier, /driver work in browser
- Authentication unchanged
- No regressions

---

## 🔍 Frontend Code Modifications (Minimal)

### Detecting Electron Environment
```javascript
// In components:
import { useElectron } from './hooks/useElectron';

export function MyComponent() {
  const { isElectron } = useElectron();
  
  if (isElectron) {
    // Optional: Electron-specific UI
    return <DesktopVersion />;
  }
  return <WebVersion />;
}
```

### Accessing Electron APIs
```javascript
const { electronAPI, minimizeWindow } = useElectron();

// Get app info
const appInfo = await electronAPI.getAppInfo();
console.log(appInfo.app); // 'admin' | 'cashier' | 'driver'

// Window controls
minimizeWindow();
```

### NO Changes Required For:
- Authentication logic ✓
- API calls ✓
- Database queries ✓
- POS sync agents ✓
- Branch/location scoping ✓
- Role-based routing ✓
- Any existing components ✓

---

## 🐛 Debugging Electron Apps

### Enable Developer Tools
```javascript
// Auto-opens in development
if (isDev) {
  mainWindow.webContents.openDevTools();
}

// Or keyboard shortcut: Ctrl+I
```

### View Main Process Logs
```javascript
console.log('[IPC]', 'message'); // Logged to console
```

### IPC Communication Debugging
```javascript
// In preload.js, add logging:
console.log('[IPC] Sending:', channel);
ipcRenderer.on('response', (...) => {
  console.log('[IPC] Received:', response);
});
```

---

## 📦 Build Artifacts (Protected in .gitignore)

### Per App:
- `desktop-apps/{app}/release/` - Release builds
- `desktop-apps/{app}/dist-electron/` - Electron build artifacts
- `*.exe`, `*.msi`, `*.dmg` - Installers

### Root Level:
- `/release/` - All release builds
- `/dist-electron/` - All Electron artifacts
- All executable files excluded

---

## ✨ Key Advantages of This Architecture

1. **Zero Breaking Changes**
   - Existing web app unaffected
   - Backend API unchanged
   - All routes work identically
   - Zero risk to production

2. **Code Reuse**
   - 100% shared React codebase
   - 100% shared authentication
   - 100% shared backend API
   - Single deploy pipeline

3. **Easy Maintenance**
   - Fix bugs once, all apps updated
   - Feature releases apply to all
   - UI consistency guaranteed
   - Single source of truth

4. **Scalable for Mobile**
   - React Native can use same API
   - Shared auth logic
   - Reusable components
   - Future-proof architecture

5. **Security-First**
   - Preload script for IPC
   - Context isolation
   - Sandbox enabled
   - No eval/require in renderer

---

## 🚨 Important Reminders

### DO NOT:
- ❌ Modify existing React components
- ❌ Change authentication logic
- ❌ Alter API endpoints
- ❌ Modify backend database schema
- ❌ Touch POS sync agents
- ❌ Change routing rules
- ❌ Commit Electron build artifacts

### DO:
- ✅ Keep web app and desktop apps in sync
- ✅ Test web app still works 100%
- ✅ Use Electron IPC for main process communication
- ✅ Test all 3 apps (admin, cashier, driver)
- ✅ Document any app-specific customizations
- ✅ Keep dependencies up to date
- ✅ Use environment variables for configuration

---

## 📞 Support & Questions

### For Development Issues:
1. Check Electron documentation: https://www.electronjs.org/docs
2. Verify preload script security model
3. Test in both web and Electron modes
4. Check .gitignore for build artifacts

### For Production Deployment:
1. Sign installers with code signing certificates
2. Implement auto-update system
3. Create installer distribution pipeline
4. Plan version management strategy

---

## 📚 Resources

- **Electron**: https://www.electronjs.org/
- **React**: https://react.dev/
- **Vite**: https://vitejs.dev/
- **electron-builder**: https://www.electron.build/
- **Secure Electron Template**: https://github.com/reZach/secure-electron-template

---

**Document Version**: 1.0  
**Last Updated**: May 16, 2026  
**Status**: ✅ Preparation Phase Complete
