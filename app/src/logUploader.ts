// Periodic batch upload of the in-memory log ring to /api/logs/upload.
//
// - Flushes every FLUSH_INTERVAL ms
// - Flushes immediately on visibilitychange=hidden / pagehide (catches app close)
// - On failure: restores the drained entries and retries on next tick
// - Fire-and-forget: never throws

import { drain, restore, formatLine, onEntry, createLogger, type Entry } from './logger';
import { uploadLogs } from './api';
import { appVersion, getPlatform } from './runtime';

const FLUSH_INTERVAL_MS = 30_000;
const ERROR_FLUSH_MS    = 2_000;  // on error-level log, push sooner
const MAX_FLUSH_LINES   = 1000;

let active: { stop: () => void } | null = null;

export function startLogUploader(serverUrl: string, sessionToken: string): () => void {
  if (active) active.stop();
  const log = createLogger('uploader');

  let cachedVersion  = '?';
  let cachedPlatform = '?';
  void appVersion().then(v => { cachedVersion = v; });
  void getPlatform().then(p => { cachedPlatform = p; });

  let inFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let errorFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function flush(): Promise<void> {
    if (inFlight || stopped) return;
    const pending = drain();
    if (!pending.length) return;

    const batch = pending.slice(0, MAX_FLUSH_LINES);
    const leftover = pending.slice(MAX_FLUSH_LINES);
    const lines = batch.map(formatLine);

    inFlight = true;
    try {
      const ok = await uploadLogs(serverUrl, sessionToken, lines, cachedVersion, cachedPlatform);
      if (!ok) restore(batch);
      if (leftover.length) restore(leftover);
    } finally {
      inFlight = false;
    }
  }

  timer = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);

  // Escalate: any error-level entry schedules a near-immediate flush so
  // a crash makes it to the server before anything else goes wrong.
  const unsubscribe = onEntry((e: Entry) => {
    if (e.level !== 'error' && e.level !== 'warn') return;
    if (errorFlushTimer) return;
    errorFlushTimer = setTimeout(() => {
      errorFlushTimer = null;
      void flush();
    }, ERROR_FLUSH_MS);
  });

  const visibilityHandler = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const pageHideHandler = () => { void flush(); };
  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('pagehide', pageHideHandler);

  log.info(`log uploader started → ${serverUrl}/api/logs/upload`);

  function stop() {
    stopped = true;
    if (timer) { clearInterval(timer); timer = null; }
    if (errorFlushTimer) { clearTimeout(errorFlushTimer); errorFlushTimer = null; }
    document.removeEventListener('visibilitychange', visibilityHandler);
    window.removeEventListener('pagehide', pageHideHandler);
    unsubscribe();
    // One last best-effort flush on stop.
    void flush();
  }

  active = { stop };
  return stop;
}

export function stopLogUploader(): void {
  if (active) { active.stop(); active = null; }
}
