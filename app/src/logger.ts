// Structured client logger.
//
// Every log entry goes three places:
//   1. browser console (immediate, devtools-friendly)
//   2. Electron main process via IPC → userData/logs/main.log (persistent)
//   3. in-memory ring buffer → periodically POSTed to /api/logs/upload so
//      the server has a copy without the user needing to send a file
//
// Usage:
//   const log = createLogger('video');
//   log.info('camera attached', { deviceId });
//   log.error('gUM failed', err);
//
// The `scope` tag is prefixed into messages so server-side greps work.

type Level = 'debug' | 'info' | 'warn' | 'error';

interface Entry {
  ts:      number;
  level:   Level;
  scope:   string;
  message: string;
  meta?:   unknown;
}

const BUFFER_MAX = 2000;
const buffer: Entry[] = [];
const listeners = new Set<(e: Entry) => void>();

function serializeMeta(meta: unknown): unknown {
  if (meta === undefined || meta === null) return meta;
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  if (typeof meta === 'object') {
    try { return JSON.parse(JSON.stringify(meta)); }
    catch { return String(meta); }
  }
  return meta;
}

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  const safeMeta = serializeMeta(meta);
  const entry: Entry = { ts: Date.now(), level, scope, message, meta: safeMeta };
  if (buffer.length >= BUFFER_MAX) buffer.shift();
  buffer.push(entry);

  // Console — keep live for devtools
  const line = `[${scope}] ${message}`;
  if (safeMeta !== undefined) (console as Record<Level, (...a: unknown[]) => void>)[level](line, safeMeta);
  else                        (console as Record<Level, (...a: unknown[]) => void>)[level](line);

  // Persistent sink via Electron main
  try { window.preecemeet?.log?.(level, scope, message, safeMeta); } catch { /* ignore */ }

  listeners.forEach(fn => { try { fn(entry); } catch { /* ignore */ } });
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => emit('debug', scope, msg, meta),
    info:  (msg: string, meta?: unknown) => emit('info',  scope, msg, meta),
    warn:  (msg: string, meta?: unknown) => emit('warn',  scope, msg, meta),
    error: (msg: string, meta?: unknown) => emit('error', scope, msg, meta),
  };
}

// Drain the ring buffer — used by the uploader. Returns the snapshot
// and clears it so successful uploads don't re-send.
export function drain(): Entry[] {
  const copy = buffer.slice();
  buffer.length = 0;
  return copy;
}

// Peek without draining — useful if a flush fails and we want to retry.
export function restore(entries: Entry[]): void {
  // Prepend back, preserving order; respect BUFFER_MAX.
  buffer.unshift(...entries.slice(-BUFFER_MAX));
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
}

export function onEntry(handler: (e: Entry) => void): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}

export function formatLine(e: Entry): string {
  const time = new Date(e.ts).toISOString();
  const meta = e.meta !== undefined ? ' ' + JSON.stringify(e.meta) : '';
  return `${time} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}${meta}`;
}

// Global wiring — unhandled errors + console capture so even unexpected
// throws make it into the log.
if (typeof window !== 'undefined') {
  const globalLog = createLogger('global');
  window.addEventListener('error', ev => {
    globalLog.error(`uncaught: ${ev.message}`, { filename: ev.filename, lineno: ev.lineno, colno: ev.colno, error: ev.error });
  });
  window.addEventListener('unhandledrejection', ev => {
    globalLog.error('unhandled promise rejection', ev.reason);
  });
}

export type { Entry, Level };
