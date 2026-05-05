// Stops React Native's default global handler from calling RCTFatal on
// unhandled JS errors (which aborts the process via objc_exception_throw —
// we hit this on every multi-participant join in build 3).
//
// Errors are still printed via console.warn and queued for upload. When a
// session is available, queued lines are POSTed to /api/logs/upload using
// the same shape as the desktop log uploader so server-side files have a
// consistent format across clients.

import { Platform } from 'react-native';
import { uploadLogs } from './api';

interface QueuedLine { ts: number; level: 'error' | 'warn' | 'info'; line: string; }

const queue: QueuedLine[] = [];
const MAX_QUEUE = 500;

function push(level: QueuedLine['level'], message: string) {
  queue.push({ ts: Date.now(), level, line: message });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
}

function format(e: QueuedLine): string {
  const t = new Date(e.ts).toISOString();
  return `${t} [${e.level.toUpperCase()}] ${e.line}`;
}

function stringify(v: unknown): string {
  if (v instanceof Error) return v.stack ? `${v.message}\n${v.stack}` : v.message;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

let session: { serverUrl: string; sessionToken: string } | null = null;
let flushing = false;

export function setSessionForLogs(s: { serverUrl: string; sessionToken: string } | null) {
  session = s;
  if (s) void flush();
}

async function flush() {
  if (flushing || !session || queue.length === 0) return;
  flushing = true;
  try {
    const batch = queue.splice(0, queue.length).map(format);
    const ok = await uploadLogs(session.serverUrl, session.sessionToken,
      batch, '1.0.0', `ios-${Platform.Version}`);
    if (!ok) {
      // Restore so we try again later — but bound it.
      const restore = batch.slice(-MAX_QUEUE);
      restore.reverse().forEach(line => queue.unshift({ ts: Date.now(), level: 'error', line }));
    }
  } finally {
    flushing = false;
  }
}

setInterval(() => { void flush(); }, 30_000);

let installed = false;

export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;

  // Pipe console.warn / console.error into the upload queue too — RN's
  // FlatList numColumns warning would have been here before it escalated
  // to a thrown invariant violation. Keeps the original behaviour.
  const origWarn  = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    push('warn',  args.map(stringify).join(' '));
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    push('error', args.map(stringify).join(' '));
    void flush();
    origError(...args);
  };

  const ErrorUtils = (globalThis as any).ErrorUtils;
  const previous = ErrorUtils?.getGlobalHandler?.();

  ErrorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
    const e = error instanceof Error ? error : new Error(String(error));
    const stack = e.stack ? `\n${e.stack}` : '';
    const line  = `unhandled${isFatal ? '(fatal)' : ''}: ${e.message}${stack}`;
    console.warn('[errorReporter]', line);
    push('error', line);
    void flush();
    // Deliberately do NOT call previous(error, true) — that's what triggers
    // RCTFatal -> abort. Letting the JS task die is enough; the rest of the
    // app keeps running.
    if (previous && !isFatal) {
      try { previous(error, false); } catch { /* swallow */ }
    }
  });

  // Surface unhandled promise rejections too.
  const tracking = (globalThis as any).HermesInternal?.enablePromiseRejectionTracker;
  if (typeof tracking === 'function') {
    tracking({
      allRejections: true,
      onUnhandled: (id: number, rejection: unknown) => {
        const r = rejection instanceof Error ? rejection : new Error(String(rejection));
        const line = `unhandled promise[${id}]: ${r.message}${r.stack ? '\n' + r.stack : ''}`;
        console.warn('[errorReporter]', line);
        push('warn', line);
        void flush();
      },
    });
  }
}

export function reportError(message: string, err?: unknown) {
  const detail = err instanceof Error
    ? `${err.message}${err.stack ? '\n' + err.stack : ''}`
    : err !== undefined ? String(err) : '';
  push('error', `${message}${detail ? ': ' + detail : ''}`);
  void flush();
}
