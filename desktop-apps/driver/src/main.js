/**
 * Citi-Nati Driver Desktop App
 * Main Electron process entry point
 * 
 * Role: Delivery tracking and order management for drivers
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const { WINDOW_SIZES, IPC_CHANNELS } = require('../../../electron/constants.js');

let mainWindow;

/**
 * Create the main application window
 * Dedicated for Driver dashboard
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZES.DEFAULT_WIDTH,
    height: WINDOW_SIZES.DEFAULT_HEIGHT,
    minWidth: WINDOW_SIZES.MIN_WIDTH,
    minHeight: WINDOW_SIZES.MIN_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, '../../../electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
    },
    icon: path.join(__dirname, 'public/driver-icon.png'),
  });

  // Load app - direct to driver dashboard
  const startUrl = isDev
    ? 'http://localhost:3000/driver'  // Dev: Direct to driver route
    : `file://${path.join(__dirname, '../../../citi-nati-frontend/dist/index.html?app=driver')}`; // Prod

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * IPC Handlers
 */
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

ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async () => {
  return {
    app: 'driver',
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    isDev,
  };
});

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
 * Driver-specific menu
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
