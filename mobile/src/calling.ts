// Mobile equivalent of app/src/calling.ts — same hub, same protocol.

import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { Session } from './session';

export interface IncomingCall { callId: string; from: string; fromDisplayName?: string | null; roomName: string; }
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
  // accepted is plain React state. Callers observe transitions via useEffect
  // and clear it after consuming. Previously this was a ref-based Set of
  // callbacks invoked synchronously in the SignalR handler — that caused
  // CallScreen to render-then-not-commit for direct calls (the parent
  // re-render evidently never fully landed). State + useEffect goes through
  // React's normal batching and the call screen mounts cleanly.
  const [accepted, setAccepted] = useState<AcceptedCall | null>(null);

  const connRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Pre-append access_token to the base URL because @microsoft/signalr's
    // WebSocketTransport on React Native does not call accessTokenFactory
    // when constructing the WS upgrade URL (Electron + browser do). Without
    // this, OnConnectedAsync receives no token and aborts the connection,
    // which loops forever. Keep accessTokenFactory too so the negotiate
    // POST gets an Authorization header.
    const url = `${session.serverUrl.replace(/\/$/, '')}/hubs/call`
              + `?access_token=${encodeURIComponent(session.sessionToken)}`;
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

    // Tune timeouts to match the server's loosened keepalive (server pings
    // every 8s, tolerates 5 min of client silence). Without raising these,
    // RN's WS sometimes batches the server pings and the client thinks the
    // server has gone away after 30s — recycling the connection every cycle.
    conn.serverTimeoutInMilliseconds   = 5 * 60 * 1000;   // 5 min
    conn.keepAliveIntervalInMilliseconds = 10 * 1000;     // client→server ping every 10s

    conn.on('PresenceChanged', (users: string[]) => setOnline(new Set(users.map(u => u.toLowerCase()))));
    conn.on('IncomingCall', (msg: IncomingCall) => setIncoming(msg));
    conn.on('CallAccepted', (msg: AcceptedCall) => {
      setIncoming(null);
      setOutgoing(null);
      setAccepted(msg);
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
      // Server signature is Call(toEmail, fromDisplayName?). SignalR's argument
      // binder rejects calls when arg count differs from the method signature
      // (it does NOT honour C# default values), so always send both — null
      // when we don't have a display name. Without this, invoke fails with
      // "Cannot invoke 'Call' due to an error on the server".
      const result = await conn.invoke<{ ok: boolean; callId?: string; roomName?: string; error?: string }>('Call', toEmail, null);
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

  const consumeAccepted = useCallback(() => setAccepted(null), []);

  return { state, online, incoming, outgoing, accepted, call, accept, decline, cancel, consumeAccepted };
}
