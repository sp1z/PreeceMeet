const { app, BrowserWindow, shell, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const IS_MAC = process.platform === 'darwin';

let mainWindow;
let savedBounds = null;
// One pending getDisplayMedia callback at a time. The renderer's picker fulfils
// it via 'display-share:choose' / 'display-share:cancel'. pendingSources caches
// the desktopCapturer.getSources() result so the choose handler doesn't have
// to call getSources() again — on Wayland that would re-invoke the XDG portal
// and prompt the user a second time.
let pendingDisplayCb = null;
let pendingSources   = null;

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
    // On Mac keep the native traffic lights but hide the title bar so we get a
    // tight custom top-bar; on Win/Linux go fully frameless and provide our
    // own min/max/close in the renderer. Game mode hides chrome on every OS.
    frame:            IS_MAC,
    titleBarStyle:    IS_MAC ? 'hiddenInset' : undefined,
    trafficLightPosition: IS_MAC ? { x: 12, y: 12 } : undefined,
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

  mainWindow.on('maximize',   () => mainWindow.webContents.send('win:maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized-changed', false));

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
    pendingSources   = null;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      pendingSources = sources;
      console.log(
        `[display-share] got ${sources.length} source(s) ` +
        `(screens=${sources.filter(s => s.id.startsWith('screen:')).length}, ` +
        `windows=${sources.filter(s => s.id.startsWith('window:')).length})`,
      );

      // Linux + Wayland: desktopCapturer.getSources() invokes the XDG portal
      // which shows the user its own native chooser and returns exactly one
      // selected source. In that case skip our picker entirely (showing it
      // would just be a single-option redundant click, and a re-enumeration
      // would re-open the portal).
      if (process.platform === 'linux' && sources.length === 1) {
        cb({ video: sources[0], audio: 'loopback' });
        pendingDisplayCb = null;
        pendingSources   = null;
        return;
      }

      const payload = sources.map(s => ({
        id:        s.id,
        name:      s.name,
        thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
        isScreen:  s.id.startsWith('screen:'),
      }));
      mainWindow.webContents.send('display-share:request', payload);
    } catch (err) {
      console.error('[display-share] getSources failed:', err);
      try { pendingDisplayCb({}); } catch {}
      pendingDisplayCb = null;
      pendingSources   = null;
    }
  });
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('app:version',         () => app.getVersion());
ipcMain.handle('app:platform',        () => process.platform);
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
ipcMain.handle('win:set-resizable',    (_ev, v)       => mainWindow?.setResizable(!!v));
ipcMain.handle('win:set-fullscreen',   (_ev, v)       => mainWindow?.setFullScreen(!!v));
ipcMain.handle('win:is-fullscreen',    ()             => !!mainWindow?.isFullScreen());
ipcMain.handle('win:save-bounds',      () => { savedBounds = mainWindow?.getBounds(); });
ipcMain.handle('win:restore-bounds',   () => { if (savedBounds) mainWindow?.setBounds(savedBounds); });

// Frameless window controls (used by the renderer's WindowControls bar).
ipcMain.handle('win:minimize',     () => mainWindow?.minimize());
ipcMain.handle('win:toggle-max',   () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false; }
  mainWindow.maximize();
  return true;
});
ipcMain.handle('win:close',        () => mainWindow?.close());
ipcMain.handle('win:is-maximized', () => !!mainWindow?.isMaximized());
// Mac-only: hide the native traffic lights (used by game mode for clean look)
ipcMain.handle('win:set-window-button-visibility', (_ev, v) => {
  if (IS_MAC && mainWindow?.setWindowButtonVisibility) mainWindow.setWindowButtonVisibility(!!v);
});

// Screen-share picker resolution from the renderer. Uses the cached source
// list from the initial getSources() call — calling getSources() a second
// time would re-prompt the user through the XDG portal on Wayland.
ipcMain.handle('display-share:choose', (_ev, sourceId) => {
  if (!pendingDisplayCb) return false;
  const cb = pendingDisplayCb;
  const sources = pendingSources || [];
  pendingDisplayCb = null;
  pendingSources   = null;
  const source = sources.find(s => s.id === sourceId);
  if (source) cb({ video: source, audio: 'loopback' });
  else        cb({});
  return !!source;
});

ipcMain.handle('display-share:cancel', () => {
  if (!pendingDisplayCb) return false;
  try { pendingDisplayCb({}); } catch {}
  pendingDisplayCb = null;
  pendingSources   = null;
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
