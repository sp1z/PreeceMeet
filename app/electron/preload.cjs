const { contextBridge, ipcRenderer } = require('electron');

// Narrow, typed-ish surface exposed to the renderer. All OS-touching
// work goes through these; the renderer never gets raw IPC.
contextBridge.exposeInMainWorld('preecemeet', {
  version:           () => ipcRenderer.invoke('app:version'),
  platform:          () => ipcRenderer.invoke('app:platform'),
  openExternal:      (url) => ipcRenderer.invoke('shell:open-external', url),
  appReady:          () => ipcRenderer.send('app:ready'),

  // Window state / sizing
  getBounds:         () => ipcRenderer.invoke('win:get-bounds'),
  setBounds:         (b) => ipcRenderer.invoke('win:set-bounds', b),
  setSize:           (w, h) => ipcRenderer.invoke('win:set-size', { w, h }),
  setContentSize:    (w, h) => ipcRenderer.invoke('win:set-content-size', { w, h }),
  setPositionNormalized: (x, y) => ipcRenderer.invoke('win:set-position-normalized', { x, y }),
  onMoved: (handler) => {
    const listener = (_ev, pos) => handler(pos);
    ipcRenderer.on('win:moved', listener);
    return () => ipcRenderer.removeListener('win:moved', listener);
  },
  setAlwaysOnTop:    (v) => ipcRenderer.invoke('win:set-always-on-top', v),
  setResizable:      (v) => ipcRenderer.invoke('win:set-resizable', v),
  setFullscreen:     (v) => ipcRenderer.invoke('win:set-fullscreen', v),
  isFullscreen:      () => ipcRenderer.invoke('win:is-fullscreen'),
  saveBounds:        () => ipcRenderer.invoke('win:save-bounds'),
  restoreBounds:     () => ipcRenderer.invoke('win:restore-bounds'),

  // Frameless window controls
  minimize:          () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize:    () => ipcRenderer.invoke('win:toggle-max'),
  close:             () => ipcRenderer.invoke('win:close'),
  isMaximized:       () => ipcRenderer.invoke('win:is-maximized'),
  setWindowButtonVisibility: (v) => ipcRenderer.invoke('win:set-window-button-visibility', v),
  onMaximizedChange: (handler) => {
    const listener = (_ev, v) => handler(!!v);
    ipcRenderer.on('win:maximized-changed', listener);
    return () => ipcRenderer.removeListener('win:maximized-changed', listener);
  },

  // Updater
  checkUpdate:       () => ipcRenderer.invoke('update:check'),
  installUpdate:     () => ipcRenderer.invoke('update:install'),

  // Screen-share picker
  onDisplayShareRequest: (handler) => {
    const listener = (_ev, sources) => handler(sources);
    ipcRenderer.on('display-share:request', listener);
    return () => ipcRenderer.removeListener('display-share:request', listener);
  },
  chooseDisplaySource: (sourceId) => ipcRenderer.invoke('display-share:choose', sourceId),
  cancelDisplayShare:  ()         => ipcRenderer.invoke('display-share:cancel'),

  // PassThru: local-only preview sources
  passThruGetSources:  () => ipcRenderer.invoke('passthru:get-sources'),

  // Logging + diagnostics
  log: (level, scope, message, meta) =>
    ipcRenderer.send('log:write', level, scope, message, meta),
  logPath:       () => ipcRenderer.invoke('log:get-path'),
  openLogFolder: () => ipcRenderer.invoke('log:open-folder'),
  toggleDevTools:() => ipcRenderer.invoke('devtools:toggle'),
});
