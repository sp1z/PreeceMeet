const { app, BrowserWindow, shell, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let savedBounds = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:            1200,
    height:           750,
    minWidth:         800,
    minHeight:        500,
    autoHideMenuBar:  true,
    backgroundColor:  '#12121e',
    title:            'PreeceMeet',
    icon:             path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Open target=_blank / external links in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Auto-grant camera / mic / screen-capture permission — we're a dedicated
  // video-call client, a per-request prompt just interrupts the flow.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    const allowed = new Set(['media', 'display-capture', 'mediaKeySystem', 'notifications', 'clipboard-read']);
    cb(allowed.has(permission));
  });

  // getDisplayMedia in Electron ≥30 requires this handler — without it
  // navigator.mediaDevices.getDisplayMedia() rejects silently and the OS
  // sharing toolbar flickers in/out.
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const screen  = sources.find(s => s.id.startsWith('screen:')) || sources[0];
      cb({ video: screen, audio: 'loopback' });
    } catch {
      cb({});
    }
  }, { useSystemPicker: true });
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('app:version',         () => app.getVersion());
ipcMain.handle('shell:open-external', async (_ev, url) => {
  if (typeof url !== 'string') return false;
  try { await shell.openExternal(url); return true; }
  catch { return false; }
});

// Window controls (powers Game Mode + fullscreen toggles in the renderer)
ipcMain.handle('win:get-bounds',       ()             => mainWindow?.getBounds());
ipcMain.handle('win:set-bounds',       (_ev, bounds)  => mainWindow?.setBounds(bounds));
ipcMain.handle('win:set-size',         (_ev, { w, h }) => mainWindow?.setSize(w, h));
ipcMain.handle('win:set-always-on-top',(_ev, v)       => mainWindow?.setAlwaysOnTop(!!v));
ipcMain.handle('win:set-fullscreen',   (_ev, v)       => mainWindow?.setFullScreen(!!v));
ipcMain.handle('win:is-fullscreen',    ()             => !!mainWindow?.isFullScreen());
ipcMain.handle('win:save-bounds',      () => { savedBounds = mainWindow?.getBounds(); });
ipcMain.handle('win:restore-bounds',   () => { if (savedBounds) mainWindow?.setBounds(savedBounds); });
ipcMain.handle('win:set-frameless',    (_ev, frameless) => {
  // Frameless toggle requires a window recreate in Electron; we approximate
  // by hiding/showing the menu bar and suppressing the OS title bar via CSS
  // in the renderer. This IPC just flips a flag the renderer can query.
  if (!mainWindow) return;
  mainWindow.setMenuBarVisibility(!frameless);
});

// ── Auto-updater (electron-updater, GitHub provider) ────────────────────────
autoUpdater.autoDownload         = false;
autoUpdater.autoInstallOnAppQuit = true;

ipcMain.handle('update:check', async () => {
  try {
    const r = await autoUpdater.checkForUpdates();
    return r?.updateInfo?.version || null;
  } catch {
    return null;
  }
});

ipcMain.handle('update:install', async () => {
  try {
    await autoUpdater.downloadUpdate();
    setTimeout(() => autoUpdater.quitAndInstall(), 500);
    return true;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
