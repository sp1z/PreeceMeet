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

declare global {
  interface Window {
    preecemeet?: {
      version:        () => Promise<string>;
      openExternal:   (url: string) => Promise<boolean>;
      getBounds:      () => Promise<{ x: number; y: number; width: number; height: number }>;
      setBounds:      (b: { x?: number; y?: number; width?: number; height?: number }) => Promise<void>;
      setSize:        (w: number, h: number) => Promise<void>;
      setContentSize: (w: number, h: number) => Promise<void>;
      setAlwaysOnTop: (v: boolean) => Promise<void>;
      setFullscreen:  (v: boolean) => Promise<void>;
      isFullscreen:   () => Promise<boolean>;
      saveBounds:     () => Promise<void>;
      restoreBounds:  () => Promise<void>;
      checkUpdate:    () => Promise<string | null>;
      installUpdate:  () => Promise<true | { error: string }>;
      onDisplayShareRequest: (h: (sources: DisplayShareSource[]) => void) => () => void;
      chooseDisplaySource:   (sourceId: string) => Promise<boolean>;
      cancelDisplayShare:    () => Promise<boolean>;
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
  async setAlwaysOnTop(v: boolean): Promise<void> {
    if (window.preecemeet) await window.preecemeet.setAlwaysOnTop(v);
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
