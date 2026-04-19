const { app, BrowserWindow, shell, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let savedBounds = null;
// One pending getDisplayMedia callback at a time. The renderer's picker fulfils
// it via 'display-share:choose' / 'display-share:cancel'.
let pendingDisplayCb = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:            1200,
    height:           750,
    minWidth:         400,
    minHeight:        180,
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

  // getDisplayMedia handler. Defer the cb until the renderer's picker resolves.
  // useSystemPicker is intentionally OFF — we want the same custom UX on every
  // OS instead of the macOS-only system picker showing on some platforms.
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (_req, cb) => {
    if (pendingDisplayCb) { try { pendingDisplayCb({}); } catch {} }
    pendingDisplayCb = cb;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      });
      const payload = sources
        .filter(s => s.thumbnail && !s.thumbnail.isEmpty())
        .map(s => ({
          id:        s.id,
          name:      s.name,
          thumbnail: s.thumbnail.toDataURL(),
          isScreen:  s.id.startsWith('screen:'),
        }));
      mainWindow.webContents.send('display-share:request', payload);
    } catch (err) {
      console.error('[display-share] getSources failed:', err);
      try { pendingDisplayCb({}); } catch {}
      pendingDisplayCb = null;
    }
  });
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
ipcMain.handle('win:set-content-size', (_ev, { w, h }) => mainWindow?.setContentSize(Math.round(w), Math.round(h)));
ipcMain.handle('win:set-always-on-top',(_ev, v)       => mainWindow?.setAlwaysOnTop(!!v));
ipcMain.handle('win:set-fullscreen',   (_ev, v)       => mainWindow?.setFullScreen(!!v));
ipcMain.handle('win:is-fullscreen',    ()             => !!mainWindow?.isFullScreen());
ipcMain.handle('win:save-bounds',      () => { savedBounds = mainWindow?.getBounds(); });
ipcMain.handle('win:restore-bounds',   () => { if (savedBounds) mainWindow?.setBounds(savedBounds); });

// Screen-share picker resolution from the renderer.
ipcMain.handle('display-share:choose', async (_ev, sourceId) => {
  if (!pendingDisplayCb) return false;
  const cb = pendingDisplayCb;
  pendingDisplayCb = null;
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source  = sources.find(s => s.id === sourceId);
    if (source) cb({ video: source, audio: 'loopback' });
    else        cb({});
    return !!source;
  } catch (err) {
    console.error('[display-share] choose failed:', err);
    cb({});
    return false;
  }
});

ipcMain.handle('display-share:cancel', () => {
  if (!pendingDisplayCb) return false;
  try { pendingDisplayCb({}); } catch {}
  pendingDisplayCb = null;
  return true;
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
