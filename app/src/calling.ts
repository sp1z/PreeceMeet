// Direct 1:1 calling — talks to the AuthApi SignalR hub at /hubs/call.
//
// The hub does *signalling only* (presence + ring/accept/decline). When a call
// is accepted both peers receive a LiveKit token + room name; media flows over
// LiveKit exactly like channel calls — this layer never touches RTCPeerConnection.

import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { Session } from './types';

export interface IncomingCall {
  callId:          string;
  from:            string;
  fromDisplayName?: string;
  roomName:        string;
}

export interface OutgoingCall {
  callId:   string;
  to:       string;
  roomName: string;
}

export interface AcceptedCall {
  callId:       string;
  roomName:     string;
  livekitToken: string;
  livekitUrl:   string;
  peer:         string;
}

type ConnState = 'disconnected' | 'connecting' | 'connected';

interface DirectCalling {
  state:     ConnState;
  online:    Set<string>;
  incoming:  IncomingCall  | null;
  outgoing:  OutgoingCall  | null;
  call:      (toEmail: string, fromDisplayName?: string) => Promise<{ ok: boolean; error?: string }>;
  accept:    () => Promise<void>;
  decline:   () => Promise<void>;
  cancel:    () => Promise<void>;
  onAccepted: (cb: (a: AcceptedCall) => void) => () => void;
  onDeclined: (cb: (callId: string) => void) => () => void;
  onCancelled: (cb: (callId: string) => void) => () => void;
}

export function useDirectCalling(session: Session): DirectCalling {
  const [state,    setState]    = useState<ConnState>('disconnected');
  const [online,   setOnline]   = useState<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingCall | null>(null);

  const connRef       = useRef<HubConnection | null>(null);
  const acceptedCbs   = useRef<Set<(a: AcceptedCall) => void>>(new Set());
  const declinedCbs   = useRef<Set<(callId: string) => void>>(new Set());
  const cancelledCbs  = useRef<Set<(callId: string) => void>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const url = `${session.serverUrl.replace(/\/$/, '')}/hubs/call`;

    const conn = new HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => session.sessionToken })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('PresenceChanged', (users: string[]) => {
      setOnline(new Set(users.map(u => u.toLowerCase())));
    });
    conn.on('IncomingCall', (msg: IncomingCall) => {
      setIncoming(msg);
    });
    conn.on('CallAccepted', (msg: AcceptedCall) => {
      // Either side: clear pending state, fire the callback so MainPage joins LiveKit.
      setIncoming(null);
      setOutgoing(null);
      acceptedCbs.current.forEach(cb => cb(msg));
    });
    conn.on('CallDeclined', (msg: { callId: string }) => {
      setOutgoing(null);
      declinedCbs.current.forEach(cb => cb(msg.callId));
    });
    conn.on('CallCancelled', (msg: { callId: string }) => {
      setIncoming(null);
      cancelledCbs.current.forEach(cb => cb(msg.callId));
    });

    conn.onreconnecting(() => setState('connecting'));
    conn.onreconnected (() => setState('connected'));
    conn.onclose       (() => setState('disconnected'));

    connRef.current = conn;
    setState('connecting');

    conn.start()
      .then(() => { if (!cancelled) setState('connected'); })
      .catch(err => { console.error('[calling] hub start failed:', err); setState('disconnected'); });

    return () => {
      cancelled = true;
      conn.stop().catch(() => { /* ignore */ });
      connRef.current = null;
    };
  }, [session.serverUrl, session.sessionToken]);

  const call = useCallback(async (toEmail: string, fromDisplayName?: string) => {
    const conn = connRef.current;
    if (!conn || conn.state !== HubConnectionState.Connected) {
      return { ok: false, error: 'Not connected to call server' };
    }
    try {
      const result = await conn.invoke<{ ok: boolean; callId?: string; roomName?: string; error?: string }>(
        'Call', toEmail, fromDisplayName ?? null,
      );
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
    const conn = connRef.current;
    if (!conn || !incoming) return;
    try { await conn.invoke('Accept', incoming.callId); }
    catch (err) { console.error('[calling] accept failed:', err); }
  }, [incoming]);

  const decline = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || !incoming) return;
    const id = incoming.callId;
    setIncoming(null);
    try { await conn.invoke('Decline', id); }
    catch (err) { console.error('[calling] decline failed:', err); }
  }, [incoming]);

  const cancel = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || !outgoing) return;
    const id = outgoing.callId;
    setOutgoing(null);
    try { await conn.invoke('Cancel', id); }
    catch (err) { console.error('[calling] cancel failed:', err); }
  }, [outgoing]);

  const onAccepted = useCallback((cb: (a: AcceptedCall) => void) => {
    acceptedCbs.current.add(cb);
    return () => { acceptedCbs.current.delete(cb); };
  }, []);
  const onDeclined = useCallback((cb: (callId: string) => void) => {
    declinedCbs.current.add(cb);
    return () => { declinedCbs.current.delete(cb); };
  }, []);
  const onCancelled = useCallback((cb: (callId: string) => void) => {
    cancelledCbs.current.add(cb);
    return () => { cancelledCbs.current.delete(cb); };
  }, []);

  return { state, online, incoming, outgoing, call, accept, decline, cancel, onAccepted, onDeclined, onCancelled };
}
