const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1200,
    height:    750,
    minWidth:  800,
    minHeight: 500,
    icon:      path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#12121e',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open external links in the user's default browser instead of the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Auto-grant media (camera/mic/screen-capture) permission requests — the
  // app is a single-origin video call client; prompting the user adds
  // nothing and breaks flows.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem', 'notifications', 'clipboard-read'];
    cb(allowed.includes(permission));
  });
}

// Called by the renderer (via preload) to open a URL externally.
ipcMain.handle('open-external', async (_ev, url) => {
  if (typeof url !== 'string') return false;
  try { await shell.openExternal(url); return true; }
  catch { return false; }
});

ipcMain.handle('app-version', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
