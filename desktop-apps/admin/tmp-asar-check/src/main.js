/**
 * Citi-Nati Admin Desktop App
 * Main Electron process entry point
 * 
 * Role: Admin dashboard with full system management capabilities
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const fs = require('fs');

// Do not require shared runtime files via repo-relative paths — resolve
// them from the app path so the packaged asar can load them reliably.
let WINDOW_SIZES = null;
let IPC_CHANNELS = null;

let mainWindow;

/**
 * Create the main application window
 * Dedicated for Admin dashboard
 */
function createWindow() {
  // Resolve shared electron runtime from the application path so both
  // development and packaged modes behave consistently.
  try {
    const appPath = app.getAppPath();
    const shared = require(path.join(appPath, 'electron', 'constants.js'));
    WINDOW_SIZES = shared.WINDOW_SIZES;
    IPC_CHANNELS = shared.IPC_CHANNELS;
  } catch (err) {
    console.error('[ADMIN][MAIN] Failed to load shared constants via app.getAppPath()', err);
    throw err;
  }

  mainWindow = new BrowserWindow({
    width: WINDOW_SIZES.DEFAULT_WIDTH,
    height: WINDOW_SIZES.DEFAULT_HEIGHT,
    minWidth: WINDOW_SIZES.MIN_WIDTH,
    minHeight: WINDOW_SIZES.MIN_HEIGHT,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'electron', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
    },
    // Prefer ICO for Windows, fall back to PNG if ICO not available.
    icon: fs.existsSync(path.join(app.getAppPath(), 'public', 'icon.ico'))
      ? path.join(app.getAppPath(), 'public', 'icon.ico')
      : path.join(app.getAppPath(), 'public', 'icon.png'),
  });

  // Load app - direct to admin dashboard
  const startUrl = isDev
    ? 'http://localhost:3000/admin'
    : `file://${path.join(app.getAppPath(), 'citi-nati-frontend', 'dist', 'index.html')}?app=admin`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // Register IPC handlers using the resolved IPC_CHANNELS
  if (IPC_CHANNELS) {
    ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
      if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
      if (mainWindow) {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      }
    });

    ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
      if (mainWindow) mainWindow.close();
    });

    ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async () => ({
      app: 'admin',
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      isDev,
    }));
  }
}

/**
 * App Lifecycle
 */
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * Admin-specific menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'DevTools', accelerator: 'CmdOrCtrl+I', role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('ready', createMenu);
