const { contextBridge, ipcRenderer } = require('electron');

// Minimal surface exposed to the renderer. Mirrors the bits of Tauri's API
// that our frontend actually calls.
contextBridge.exposeInMainWorld('__PREECE_ELECTRON__', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  version:      () => ipcRenderer.invoke('app-version'),
});
