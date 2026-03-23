'use strict';

const {
  app, BrowserWindow, ipcMain, dialog, shell,
  Tray, Menu, nativeImage,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');

// ─── Constants ───────────────────────────────────────────────────────
const isDev       = !app.isPackaged;
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_DATA_DIR = path.join(app.getPath('userData'), 'data');
const PORT        = 3001;

// ─── Log file (helps diagnose startup failures) ───────────────────────
const LOG_DIR  = path.join(app.getPath('userData'), 'logs');
const LOG_PATH = path.join(LOG_DIR, 'main.log');
fs.mkdirSync(LOG_DIR, { recursive: true });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_PATH, line); } catch { /* ignore */ }
}

// ─── State ───────────────────────────────────────────────────────────
let mainWindow = null;
let tray       = null;

// ─── Config helpers ──────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return null; }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Path helpers (dev vs packaged) ──────────────────────────────────
function getServerScript() {
  return isDev
    ? path.join(__dirname, '../server/index.js')
    : path.join(process.resourcesPath, 'server', 'index.js');
}

function getDistPath() {
  return isDev
    ? path.join(__dirname, '../dist')
    : path.join(process.resourcesPath, 'dist');
}

// ─── Backend ─────────────────────────────────────────────────────────
// Run the Express server inline in the Electron main process.
// This avoids ABI issues with native modules (better-sqlite3, sharp)
// that occur when running in a separate child/utility process.
function startServer(dataDir) {
  process.env.PORT        = String(PORT);
  process.env.DB_PATH     = path.join(dataDir, 'tracker.db');
  process.env.DIST_PATH   = getDistPath();
  process.env.IS_ELECTRON = 'true';

  log('Starting server…');
  log('  DB_PATH  :', process.env.DB_PATH);
  log('  DIST_PATH:', process.env.DIST_PATH);
  log('  Script   :', getServerScript());

  try {
    require(getServerScript());
    log('Server module loaded OK');
  } catch (err) {
    log('ERROR: Server failed to start:', err.message, err.stack);
    dialog.showErrorBox(
      'BenchLog — Server Error',
      `The backend failed to start.\n\n${err.message}\n\nLog: ${LOG_PATH}`
    );
  }
}

// ─── Wait for server to be ready ─────────────────────────────────────
function waitForServer(onReady, onTimeout, attempt = 0) {
  if (attempt > 35) {
    log('Server did not respond after', attempt, 'attempts');
    onTimeout();
    return;
  }
  const req = http.get(`http://localhost:${PORT}/api/stats`, (res) => {
    log('Server ready after', attempt, 'attempts (status', res.statusCode + ')');
    onReady();
  });
  req.on('error', () => {
    setTimeout(() => waitForServer(onReady, onTimeout, attempt + 1), 300);
  });
  req.setTimeout(500, () => req.destroy());
}

// ─── Main window ─────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: { contextIsolation: true },
    title: 'BenchLog',
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show loading page immediately so user sees something
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  // Poll until Express is accepting connections, then load the real app
  waitForServer(
    () => {
      if (!mainWindow) return;
      mainWindow.loadURL(`http://localhost:${PORT}`);
    },
    () => {
      // Timeout — update loading page to show error hint
      if (!mainWindow) return;
      mainWindow.webContents.executeJavaScript(`
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('logPath').textContent = ${JSON.stringify(LOG_PATH)};
      `).catch(() => {});
    }
  );
}

// ─── Setup window (first run) ────────────────────────────────────────
function createSetupWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
    title: 'BenchLog — Setup',
    show: false,
    autoHideMenuBar: true,
  });

  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'setup.html'));
  return win;
}

// ─── IPC (used by setup window) ──────────────────────────────────────
ipcMain.handle('get-default-data-dir', () => DEFAULT_DATA_DIR);

ipcMain.handle('browse-data-dir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose data folder',
    defaultPath: DEFAULT_DATA_DIR,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('complete-setup', async (event, dataDir) => {
  writeConfig({ dataDir });
  startServer(dataDir);
  createMainWindow();
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ─── System tray ─────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../build/icon.png');
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(img.isEmpty() ? img : img.resize({ width: 16, height: 16 }));
  tray.setToolTip('BenchLog');

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open BenchLog',
      click: () => mainWindow ? mainWindow.show() : createMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Open Data Folder',
      click: () => {
        const cfg = readConfig();
        if (cfg?.dataDir) shell.openPath(cfg.dataDir);
      },
    },
    {
      label: 'Change Data Folder…',
      click: async () => {
        const cfg = readConfig();
        const result = await dialog.showOpenDialog({
          title: 'Choose new data folder',
          defaultPath: cfg?.dataDir || DEFAULT_DATA_DIR,
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled) return;
        const newDir = result.filePaths[0];
        writeConfig({ ...cfg, dataDir: newDir });
        const { response } = await dialog.showMessageBox({
          type: 'info',
          message: 'Data folder updated',
          detail: `New path:\n${newDir}\n\nRestart BenchLog for the change to take effect.`,
          buttons: ['Restart Now', 'Later'],
          defaultId: 0,
        });
        if (response === 0) { app.relaunch(); app.quit(); }
      },
    },
    { type: 'separator' },
    { label: 'Quit BenchLog', click: () => app.quit() },
  ]));

  tray.on('double-click', () => mainWindow ? mainWindow.show() : createMainWindow());
}

// ─── App lifecycle ───────────────────────────────────────────────────

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  log('App ready. isDev:', isDev);
  log('userData:', app.getPath('userData'));

  createTray();

  const config = readConfig();
  if (config?.dataDir) {
    log('Config found, dataDir:', config.dataDir);
    startServer(config.dataDir);
    createMainWindow();
  } else {
    log('No config — showing setup window');
    createSetupWindow();
  }
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('activate', () => { if (!mainWindow) createMainWindow(); });
