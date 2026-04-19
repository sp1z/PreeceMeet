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
  setContentSize:    (w, h) => ipcRenderer.invoke('win:set-content-size', { w, h }),
  setAlwaysOnTop:    (v) => ipcRenderer.invoke('win:set-always-on-top', v),
  setFullscreen:     (v) => ipcRenderer.invoke('win:set-fullscreen', v),
  isFullscreen:      () => ipcRenderer.invoke('win:is-fullscreen'),
  saveBounds:        () => ipcRenderer.invoke('win:save-bounds'),
  restoreBounds:     () => ipcRenderer.invoke('win:restore-bounds'),

  // Updater
  checkUpdate:       () => ipcRenderer.invoke('update:check'),
  installUpdate:     () => ipcRenderer.invoke('update:install'),

  // Screen-share picker — main pushes 'display-share:request' with the source
  // list when getDisplayMedia fires; renderer chooses or cancels via the
  // matching invokes.
  onDisplayShareRequest: (handler) => {
    const listener = (_ev, sources) => handler(sources);
    ipcRenderer.on('display-share:request', listener);
    return () => ipcRenderer.removeListener('display-share:request', listener);
  },
  chooseDisplaySource: (sourceId) => ipcRenderer.invoke('display-share:choose', sourceId),
  cancelDisplayShare:  ()         => ipcRenderer.invoke('display-share:cancel'),
});
