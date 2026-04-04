import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import type { Session, Settings, RoomConnection, RoomInfo, Channel } from '../types';
import { saveSettings, clearSession } from '../settings';
import { getRooms, getRoomToken, UnauthorizedError } from '../api';
import Sidebar from '../components/Sidebar';
import VideoGrid from '../components/VideoGrid';
import CallControls from '../components/CallControls';

interface Props {
  session: Session;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onSignOut: () => void;
}

type ConnectState = 'idle' | 'connecting' | 'connected';

export default function MainPage({ session, settings, onSettingsChange, onSignOut }: Props) {
  const [sidebarVisible, setSidebarVisible] = useState(settings.sidebarVisible);
  const [rooms,          setRooms]          = useState<RoomInfo[]>([]);
  const [connection,     setConnection]     = useState<RoomConnection | null>(null);
  const [connectState,   setConnectState]   = useState<ConnectState>('idle');
  const [micMuted,       setMicMuted]       = useState(false);
  const [camMuted,       setCamMuted]       = useState(false);
  const [error,          setError]          = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Poll room list every 5 seconds
  const pollRooms = useCallback(async () => {
    try {
      const list = await getRooms(session.serverUrl, session.sessionToken);
      setRooms(list);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        clearSession();
        onSignOut();
      }
    }
  }, [session, onSignOut]);

  useEffect(() => {
    pollRooms();
    pollRef.current = setInterval(pollRooms, 5000);
    return () => clearInterval(pollRef.current);
  }, [pollRooms]);

  async function joinChannel(channel: Channel) {
    if (connection?.roomName === channel.name) return;
    setError('');
    setConnectState('connecting');
    // Disconnect existing room by clearing connection first
    setConnection(null);
    try {
      const result = await getRoomToken(
        session.serverUrl,
        session.sessionToken,
        channel.name,
        settings.displayName || undefined,
      );
      setConnection({
        key:      `${channel.name}-${Date.now()}`,
        url:      result.livekitUrl,
        token:    result.livekitToken,
        roomName: channel.name,
      });
      setConnectState('connected');
      setMicMuted(false);
      setCamMuted(false);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearSession();
        onSignOut();
        return;
      }
      setConnectState('idle');
      setError(err instanceof Error ? err.message : 'Could not join room.');
    }
  }

  function handleHangup() {
    setConnection(null);
    setConnectState('idle');
  }

  function handleDisconnected() {
    setConnection(null);
    setConnectState('idle');
  }

  function toggleSidebar() {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    const updated = { ...settings, sidebarVisible: next };
    onSettingsChange(updated);
    saveSettings(updated);
  }

  function handleSignOut() {
    clearSession();
    onSignOut();
  }

  const activeRoomName = connection?.roomName ?? null;

  return (
    <div className="app-layout">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="top-bar">
        <button className="icon-btn" onClick={toggleSidebar} title="Toggle sidebar">☰</button>
        <span className="room-name">
          {activeRoomName ? `#${activeRoomName}` : 'No active call'}
        </span>
        {error && <span style={{ fontSize: 12, color: '#ef5350' }}>{error}</span>}
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className={`content-row${sidebarVisible ? '' : ' sidebar-hidden'}`}
           style={{ '--sidebar-width': '220px' } as React.CSSProperties}>
        <Sidebar
          channels={settings.channels}
          rooms={rooms}
          activeRoom={activeRoomName}
          email={session.email || ''}
          onJoin={joinChannel}
          onSignOut={handleSignOut}
          visible={sidebarVisible}
        />

        <div className="video-area">
          {connectState === 'idle' && !connection && (
            <div className="empty-state">
              <div className="big-icon">📹</div>
              <h2>Select a channel to join</h2>
              <p>Click a channel in the sidebar to start a call</p>
            </div>
          )}

          {connectState === 'connecting' && (
            <div className="overlay">
              <div className="overlay-card">
                <div className="spinner" />
                <h3>Connecting…</h3>
                <p>Joining room</p>
              </div>
            </div>
          )}

          {connection && (
            <LiveKitRoom
              key={connection.key}
              serverUrl={connection.url}
              token={connection.token}
              connect={true}
              audio={!micMuted}
              video={!camMuted}
              onDisconnected={handleDisconnected}
              onError={err => setError(err.message)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              <RoomAudioRenderer />
              <VideoGrid />
            </LiveKitRoom>
          )}
        </div>
      </div>

      {/* ── Call controls ────────────────────────────────────────────── */}
      <CallControls
        connected={!!connection}
        micMuted={micMuted}
        camMuted={camMuted}
        onToggleMic={() => setMicMuted(m => !m)}
        onToggleCam={() => setCamMuted(c => !c)}
        onHangup={handleHangup}
      />
    </div>
  );
}
