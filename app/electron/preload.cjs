const { contextBridge, ipcRenderer } = require('electron');

// Narrow, typed-ish surface exposed to the renderer. All OS-touching
// work goes through these; the renderer never gets raw IPC.
contextBridge.exposeInMainWorld('preecemeet', {
  version:           () => ipcRenderer.invoke('app:version'),
  openExternal:      (url) => ipcRenderer.invoke('shell:open-external', url),

  // Window
  getBounds:         () => ipcRenderer.invoke('win:get-bounds'),
  setBounds:         (b) => ipcRenderer.invoke('win:set-bounds', b),
  setSize:           (w, h) => ipcRenderer.invoke('win:set-size', { w, h }),
  setAlwaysOnTop:    (v) => ipcRenderer.invoke('win:set-always-on-top', v),
  setFullscreen:     (v) => ipcRenderer.invoke('win:set-fullscreen', v),
  isFullscreen:      () => ipcRenderer.invoke('win:is-fullscreen'),
  saveBounds:        () => ipcRenderer.invoke('win:save-bounds'),
  restoreBounds:     () => ipcRenderer.invoke('win:restore-bounds'),
  setFrameless:      (v) => ipcRenderer.invoke('win:set-frameless', v),

  // Updater
  checkUpdate:       () => ipcRenderer.invoke('update:check'),
  installUpdate:     () => ipcRenderer.invoke('update:install'),
});
