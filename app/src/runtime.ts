// Thin wrapper over the Electron preload API (see electron/preload.cjs).
// All renderer-side code goes through these helpers so the React components
// don't need to know whether they're running inside Electron or a plain
// browser (the latter is only used for `npm run dev` and best-effort works).

export interface DisplayShareSource {
  id:        string;
  name:      string;
  thumbnail: string;
  isScreen:  boolean;
}

export type Platform = 'darwin' | 'win32' | 'linux' | 'browser';

declare global {
  interface Window {
    preecemeet?: {
      version:        () => Promise<string>;
      platform:       () => Promise<NodeJS.Platform>;
      openExternal:   (url: string) => Promise<boolean>;
      appReady:       () => void;
      getBounds:      () => Promise<{ x: number; y: number; width: number; height: number }>;
      setBounds:      (b: { x?: number; y?: number; width?: number; height?: number }) => Promise<void>;
      setSize:        (w: number, h: number) => Promise<void>;
      setContentSize: (w: number, h: number) => Promise<void>;
      setPositionNormalized: (x: number, y: number) => Promise<{ x: number; y: number } | null>;
      onMoved:        (handler: (pos: { x: number; y: number }) => void) => () => void;
      setAlwaysOnTop: (v: boolean) => Promise<void>;
      setResizable:   (v: boolean) => Promise<void>;
      setFullscreen:  (v: boolean) => Promise<void>;
      isFullscreen:   () => Promise<boolean>;
      saveBounds:     () => Promise<void>;
      restoreBounds:  () => Promise<void>;
      minimize:       () => Promise<void>;
      toggleMaximize: () => Promise<boolean>;
      close:          () => Promise<void>;
      isMaximized:    () => Promise<boolean>;
      setWindowButtonVisibility: (v: boolean) => Promise<void>;
      onMaximizedChange: (h: (v: boolean) => void) => () => void;
      checkUpdate:    () => Promise<string | null>;
      installUpdate:  () => Promise<true | { error: string }>;
      onDisplayShareRequest: (h: (sources: DisplayShareSource[]) => void) => () => void;
      chooseDisplaySource:   (sourceId: string) => Promise<boolean>;
      cancelDisplayShare:    () => Promise<boolean>;
      log?:            (level: string, scope: string, message: string, meta?: unknown) => void;
      logPath?:        () => Promise<string>;
      openLogFolder?:  () => Promise<boolean>;
      toggleDevTools?: () => Promise<boolean>;
    };
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.preecemeet;

export async function openExternal(url: string): Promise<void> {
  if (window.preecemeet) {
    await window.preecemeet.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function appVersion(): Promise<string> {
  if (window.preecemeet) return window.preecemeet.version();
  return '0.0.0-dev';
}

export async function getPlatform(): Promise<Platform> {
  if (!window.preecemeet) return 'browser';
  const p = await window.preecemeet.platform();
  if (p === 'darwin' || p === 'win32' || p === 'linux') return p;
  return 'browser';
}

export async function checkForUpdate(): Promise<string | null> {
  if (!window.preecemeet) return null;
  try { return await window.preecemeet.checkUpdate(); }
  catch { return null; }
}

export async function installUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!window.preecemeet) return { ok: false, error: 'Not running inside Electron' };
  const r = await window.preecemeet.installUpdate();
  if (r === true) return { ok: true };
  return { ok: false, error: r.error };
}

// Window controls (Game Mode / fullscreen) — no-op safely in browser mode.
export const windowCtl = {
  async setSize(w: number, h: number): Promise<void> {
    if (window.preecemeet) await window.preecemeet.setSize(w, h);
  },
  async setContentSize(w: number, h: number): Promise<void> {
    if (window.preecemeet) await window.preecemeet.setContentSize(w, h);
  },
  async setPositionNormalized(x: number, y: number): Promise<{ x: number; y: number } | null> {
    if (!window.preecemeet) return null;
    return window.preecemeet.setPositionNormalized(x, y);
  },
  onMoved(handler: (pos: { x: number; y: number }) => void): () => void {
    if (!window.preecemeet) return () => {};
    return window.preecemeet.onMoved(handler);
  },
  async setAlwaysOnTop(v: boolean): Promise<void> {
    if (window.preecemeet) await window.preecemeet.setAlwaysOnTop(v);
  },
  async setResizable(v: boolean): Promise<void> {
    if (window.preecemeet) await window.preecemeet.setResizable(v);
  },
  async setWindowButtonVisibility(v: boolean): Promise<void> {
    if (window.preecemeet) await window.preecemeet.setWindowButtonVisibility(v);
  },
  async toggleFullscreen(): Promise<boolean> {
    if (window.preecemeet) {
      const now = await window.preecemeet.isFullscreen();
      await window.preecemeet.setFullscreen(!now);
      return !now;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    } else {
      await document.documentElement.requestFullscreen();
      return true;
    }
  },
  async isFullscreen(): Promise<boolean> {
    if (window.preecemeet) return window.preecemeet.isFullscreen();
    return !!document.fullscreenElement;
  },
  async saveBounds(): Promise<void> {
    if (window.preecemeet) await window.preecemeet.saveBounds();
  },
  async restoreBounds(): Promise<void> {
    if (window.preecemeet) await window.preecemeet.restoreBounds();
  },
  async minimize(): Promise<void> {
    if (window.preecemeet) await window.preecemeet.minimize();
  },
  async toggleMaximize(): Promise<boolean> {
    if (window.preecemeet) return window.preecemeet.toggleMaximize();
    return false;
  },
  async close(): Promise<void> {
    if (window.preecemeet) await window.preecemeet.close();
  },
  async isMaximized(): Promise<boolean> {
    if (window.preecemeet) return window.preecemeet.isMaximized();
    return false;
  },
  onMaximizedChange(handler: (v: boolean) => void): () => void {
    if (!window.preecemeet) return () => {};
    return window.preecemeet.onMaximizedChange(handler);
  },
};

// Diagnostics surface: DevTools toggle + "Open Logs Folder".
export const diagnostics = {
  async toggleDevTools(): Promise<void> {
    if (window.preecemeet?.toggleDevTools) await window.preecemeet.toggleDevTools();
  },
  async openLogFolder(): Promise<boolean> {
    if (!window.preecemeet?.openLogFolder) return false;
    return window.preecemeet.openLogFolder();
  },
  async logPath(): Promise<string | null> {
    if (!window.preecemeet?.logPath) return null;
    try { return await window.preecemeet.logPath(); } catch { return null; }
  },
};

// Screen-share picker bridge. The main process pushes a source list when
// LiveKit calls getDisplayMedia; the renderer picks one (or cancels).
export const displayShare = {
  onRequest(handler: (sources: DisplayShareSource[]) => void): () => void {
    if (!window.preecemeet) return () => {};
    return window.preecemeet.onDisplayShareRequest(handler);
  },
  async choose(sourceId: string): Promise<void> {
    if (window.preecemeet) await window.preecemeet.chooseDisplaySource(sourceId);
  },
  async cancel(): Promise<void> {
    if (window.preecemeet) await window.preecemeet.cancelDisplayShare();
  },
};
