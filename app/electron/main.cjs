const { app, BrowserWindow, shell, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log  = require('electron-log/main');

const IS_MAC = process.platform === 'darwin';

// ── Logging ─────────────────────────────────────────────────────────────────
// Writes to userData/logs/main.log with rotation. Renderer goes through the
// `log:*` IPC handlers below. Expose a file path for the "Open Logs Folder"
// menu/button so users can grab logs without knowing platform conventions.
log.initialize();
log.transports.file.level    = 'info';
log.transports.console.level = 'info';
log.transports.file.maxSize  = 5 * 1024 * 1024; // 5 MB — autorotate
log.info(`─── PreeceMeet v${app.getVersion()} starting on ${process.platform} (${process.arch}) ───`);
log.info(`node=${process.versions.node} electron=${process.versions.electron} chromium=${process.versions.chrome}`);
log.info(`log file: ${log.transports.file.getFile().path}`);
autoUpdater.logger = log;
process.on('uncaughtException',  err => log.error('uncaughtException', err));
process.on('unhandledRejection', err => log.error('unhandledRejection', err));

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
    // Hide the window until the renderer is ready so users see the brand
    // splash as their first frame, not a white Electron default. show() is
    // called from the did-finish-load handler below.
    show:             false,
    autoHideMenuBar:  true,
    backgroundColor:  '#0B1220',
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

  // Fallback reveal: if the renderer never signals ready (dev hot-reload,
  // bundle error, etc.), still show the window after a short grace period
  // so the user isn't staring at nothing.
  const fallbackShow = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      log.warn('renderer did not signal app:ready within 5s — revealing window anyway');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 5000);
  mainWindow.on('closed', () => clearTimeout(fallbackShow));

  mainWindow.on('maximize',   () => mainWindow.webContents.send('win:maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized-changed', false));

  // Throttle move events — the OS fires these very rapidly while dragging.
  // We only need a sample every ~150ms to persist a "last good" position.
  let moveTimer = null;
  mainWindow.on('move', () => {
    if (moveTimer) return;
    moveTimer = setTimeout(() => {
      moveTimer = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const { x, y } = mainWindow.getBounds();
        mainWindow.webContents.send('win:moved', { x, y });
      }
    }, 150);
  });

  // DevTools hotkey: F12 or Ctrl/Cmd+Shift+I (undocked by default so it pops
  // into its own window and doesn't steal space from the call UI).
  mainWindow.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    const mod = IS_MAC ? input.meta : input.control;
    const toggle =
      input.key === 'F12' ||
      (mod && input.shift && (input.key === 'I' || input.key === 'i'));
    if (toggle) {
      ev.preventDefault();
      if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
      else mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('render-process-gone', details);
  });
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    log.error('preload-error', preloadPath, err);
  });

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
      log.info(
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
      log.error('[display-share] getSources failed:', err);
      try { pendingDisplayCb({}); } catch {}
      pendingDisplayCb = null;
      pendingSources   = null;
    }
  });
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('app:version',         () => app.getVersion());
ipcMain.handle('app:platform',        () => process.platform);

// Renderer says "splash is painted, reveal me". We show and focus here so
// the first pixel the user sees is the splash — never a white flash.
ipcMain.on('app:ready', () => {
  if (!mainWindow || mainWindow.isVisible()) return;
  mainWindow.show();
  mainWindow.focus();
});
ipcMain.handle('shell:open-external', async (_ev, url) => {
  if (typeof url !== 'string') return false;
  try { await shell.openExternal(url); return true; }
  catch { return false; }
});

// ── Log bridge + viewer ─────────────────────────────────────────────────────
// Renderer pushes log entries through here so everything lands in a single
// rotating file (userData/logs/main.log). Renderer-originated lines get a
// [renderer] prefix so they're easy to grep. Levels are whitelisted.
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
ipcMain.on('log:write', (_ev, level, scope, message, meta) => {
  const lvl  = LOG_LEVELS.has(level) ? level : 'info';
  const tag  = `[renderer${scope ? ':' + scope : ''}]`;
  if (meta !== undefined) log[lvl](tag, message, meta);
  else                    log[lvl](tag, message);
});
ipcMain.handle('log:get-path', () => log.transports.file.getFile().path);
ipcMain.handle('log:open-folder', async () => {
  const logPath = log.transports.file.getFile().path;
  const dir = path.dirname(logPath);
  try { await shell.openPath(dir); return true; } catch { return false; }
});

// DevTools toggle from the renderer (button on the top bar).
ipcMain.handle('devtools:toggle', () => {
  if (!mainWindow) return false;
  const wc = mainWindow.webContents;
  if (wc.isDevToolsOpened()) { wc.closeDevTools(); return false; }
  wc.openDevTools({ mode: 'detach' });
  return true;
});

// Window controls (powers Game Mode + fullscreen toggles in the renderer)
ipcMain.handle('win:get-bounds',       ()             => mainWindow?.getBounds());
ipcMain.handle('win:set-bounds',       (_ev, bounds)  => mainWindow?.setBounds(bounds));

// Move the window to {x, y}, clamped so the entire window stays inside the
// nearest display's work area. Used by Game Mode when restoring its last
// remembered position — the user might have moved a monitor or changed
// resolution since they last used Game Mode, so a saved position can be
// off-screen. We never want a saved position to make the window unreachable.
ipcMain.handle('win:set-position-normalized', (_ev, { x, y }) => {
  if (!mainWindow) return null;
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching({ x, y, width: current.width, height: current.height });
  const wa      = display.workArea;
  const clampedX = Math.max(wa.x,            Math.min(x, wa.x + wa.width  - current.width));
  const clampedY = Math.max(wa.y,            Math.min(y, wa.y + wa.height - current.height));
  mainWindow.setBounds({ x: clampedX, y: clampedY, width: current.width, height: current.height });
  return { x: clampedX, y: clampedY };
});
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
//
// Audio policy: on Windows we use 'loopbackWithMute' which captures system
// audio AND silences our own app's playback for the duration of the share —
// so other participants' voices coming through our speakers don't leak back
// into the screen-share track and create an echo. On other platforms only
// 'loopback' exists; if that turns out to echo, the user can mute the
// remote audio per-tile via right-click "Mute audio for me".
const DISPLAY_AUDIO = process.platform === 'win32' ? 'loopbackWithMute' : 'loopback';

ipcMain.handle('display-share:choose', (_ev, sourceId) => {
  if (!pendingDisplayCb) return false;
  const cb = pendingDisplayCb;
  const sources = pendingSources || [];
  pendingDisplayCb = null;
  pendingSources   = null;
  const source = sources.find(s => s.id === sourceId);
  if (source) cb({ video: source, audio: DISPLAY_AUDIO });
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

// PassThru: enumerate capture sources for the renderer's local-only preview.
// This is independent of the LiveKit getDisplayMedia flow above — the stream
// never leaves this machine, so there's no pending callback to resolve.
ipcMain.handle('passthru:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    log.info(`[passthru] got ${sources.length} source(s)`);
    return sources.map(s => ({
      id:        s.id,
      name:      s.name,
      thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
      isScreen:  s.id.startsWith('screen:'),
    }));
  } catch (err) {
    log.error('[passthru] getSources failed:', err);
    return [];
  }
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
