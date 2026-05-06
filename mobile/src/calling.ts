// Mobile equivalent of app/src/calling.ts — same hub, same protocol.

import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { Session } from './session';

export interface IncomingCall { callId: string; from: string; roomName: string; }
export interface OutgoingCall { callId: string; to: string; roomName: string; }
export interface AcceptedCall {
  callId: string; roomName: string;
  livekitToken: string; livekitUrl: string; peer: string;
}

type ConnState = 'disconnected' | 'connecting' | 'connected';

export function useDirectCalling(session: Session) {
  const [state,    setState]    = useState<ConnState>('disconnected');
  const [online,   setOnline]   = useState<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingCall | null>(null);

  const connRef     = useRef<HubConnection | null>(null);
  const acceptedCbs = useRef<Set<(a: AcceptedCall) => void>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const url = `${session.serverUrl.replace(/\/$/, '')}/hubs/call`;
    const conn = new HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => session.sessionToken })
      .withAutomaticReconnect({
        // Never give up — the array form caps at 5 retries (~47s) and then
        // dies permanently. A short server outage (deploy, restart) would
        // wipe out presence forever from the client's perspective until the
        // app is killed and reopened. Linear backoff capped at 30s.
        nextRetryDelayInMilliseconds: ctx => {
          const wait = Math.min(2000 + ctx.previousRetryCount * 2000, 30000);
          return wait;
        },
      })
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('PresenceChanged', (users: string[]) => setOnline(new Set(users.map(u => u.toLowerCase()))));
    conn.on('IncomingCall', (msg: IncomingCall) => setIncoming(msg));
    conn.on('CallAccepted', (msg: AcceptedCall) => {
      setIncoming(null);
      setOutgoing(null);
      acceptedCbs.current.forEach(cb => cb(msg));
    });
    conn.on('CallDeclined',  () => setOutgoing(null));
    conn.on('CallCancelled', () => setIncoming(null));

    conn.onreconnecting(() => { console.warn('[calling] reconnecting'); setState('connecting'); });
    conn.onreconnected (() => { console.warn('[calling] reconnected');  setState('connected');  });
    conn.onclose       (err => {
      // SignalR fires this after the retry policy gives up *or* if no policy
      // accepted the delay. Our policy is infinite, but be defensive: if we
      // somehow reach this state, kick a fresh start in 5s so presence
      // doesn't stay broken forever after a long outage.
      console.warn('[calling] connection closed', err);
      setState('disconnected');
      if (cancelled) return;
      setTimeout(() => {
        if (cancelled) return;
        console.warn('[calling] manual restart after onclose');
        conn.start()
          .then(() => setState('connected'))
          .catch(e => console.warn('[calling] manual restart failed', e));
      }, 5000);
    });

    connRef.current = conn;
    setState('connecting');
    conn.start()
      .then(() => { if (!cancelled) setState('connected'); })
      .catch(err => { console.warn('[calling] hub start:', err); setState('disconnected'); });

    return () => {
      cancelled = true;
      conn.stop().catch(() => { /* ignore */ });
      connRef.current = null;
    };
  }, [session.serverUrl, session.sessionToken]);

  const call = useCallback(async (toEmail: string) => {
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) {
      return { ok: false, error: 'Not connected to call server' };
    }
    try {
      const result = await conn.invoke<{ ok: boolean; callId?: string; roomName?: string; error?: string }>('Call', toEmail);
      if (result.ok && result.callId && result.roomName) {
        setOutgoing({ callId: result.callId, to: toEmail, roomName: result.roomName });
        return { ok: true };
      }
      return { ok: false, error: result.error || 'Call failed' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const accept = useCallback(async () => {
    if (!connRef.current || !incoming) return;
    try { await connRef.current.invoke('Accept', incoming.callId); }
    catch (err) { console.warn('[calling] accept:', err); }
  }, [incoming]);

  const decline = useCallback(async () => {
    if (!connRef.current || !incoming) return;
    const id = incoming.callId; setIncoming(null);
    try { await connRef.current.invoke('Decline', id); } catch { /* ignore */ }
  }, [incoming]);

  const cancel = useCallback(async () => {
    if (!connRef.current || !outgoing) return;
    const id = outgoing.callId; setOutgoing(null);
    try { await connRef.current.invoke('Cancel', id); } catch { /* ignore */ }
  }, [outgoing]);

  const onAccepted = useCallback((cb: (a: AcceptedCall) => void) => {
    acceptedCbs.current.add(cb);
    return () => { acceptedCbs.current.delete(cb); };
  }, []);

  return { state, online, incoming, outgoing, call, accept, decline, cancel, onAccepted };
}
