import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import type { Session, Settings, RoomConnection, RoomInfo, Channel } from '../types';
import { saveSettings, clearSession } from '../settings';
import { getRooms, getRoomToken, UnauthorizedError } from '../api';
import Sidebar from '../components/Sidebar';
import VideoGrid from '../components/VideoGrid';
import CallControls from '../components/CallControls';
import SettingsModal from '../components/SettingsModal';

interface Props {
  session:          Session;
  settings:         Settings;
  onSettingsChange: (s: Settings) => void;
  onSignOut:        () => void;
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
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [gameMode,       setGameMode]       = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Poll room list every 5 seconds
  const pollRooms = useCallback(async () => {
    try {
      const list = await getRooms(session.serverUrl, session.sessionToken);
      setRooms(list);
    } catch (e) {
      if (e instanceof UnauthorizedError) { clearSession(); onSignOut(); }
    }
  }, [session, onSignOut]);

  useEffect(() => {
    void pollRooms();
    pollRef.current = setInterval(() => void pollRooms(), 5000);
    return () => clearInterval(pollRef.current);
  }, [pollRooms]);

  async function joinChannel(channel: Channel) {
    if (connection?.roomName === channel.name) return;
    setError('');
    setConnectState('connecting');
    setConnection(null);
    try {
      const result = await getRoomToken(
        session.serverUrl,
        session.sessionToken,
        channel.name,
        settings.displayName || undefined,
      );
      setConnection({ key: `${channel.name}-${Date.now()}`, url: result.livekitUrl, token: result.livekitToken, roomName: channel.name });
      setConnectState('connected');
      setMicMuted(false);
      setCamMuted(false);
    } catch (err) {
      if (err instanceof UnauthorizedError) { clearSession(); onSignOut(); return; }
      setConnectState('idle');
      setError(err instanceof Error ? err.message : 'Could not join room.');
    }
  }

  function handleHangup() { setConnection(null); setConnectState('idle'); }
  function handleDisconnected() { setConnection(null); setConnectState('idle'); }

  function toggleSidebar() {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    const updated = { ...settings, sidebarVisible: next };
    onSettingsChange(updated);
    saveSettings(updated);
  }

  function handleSaveSettings(s: Settings) {
    onSettingsChange(s);
    saveSettings(s);
  }

  function handleSignOut() { clearSession(); onSignOut(); }

  const activeRoomName = connection?.roomName ?? null;

  return (
    <div className={`app-layout${gameMode ? ' game-mode' : ''}`}>

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="top-bar">
        <button className="icon-btn" onClick={toggleSidebar} title="Toggle sidebar">
          <BurgerIcon />
        </button>
        <span className="room-name">
          {activeRoomName ? `#${activeRoomName}` : 'No active call'}
        </span>
        {error && <span style={{ fontSize: 12, color: '#ef5350', flex: 1 }}>{error}</span>}
        <button
          className={`icon-btn${gameMode ? ' active' : ''}`}
          onClick={() => setGameMode(g => !g)}
          title={gameMode ? 'Exit Game Mode' : 'Game Mode — hide UI for streaming'}
        >
          <GameModeIcon />
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          <SettingsIcon />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className={`content-row${sidebarVisible ? '' : ' sidebar-hidden'}`}
           style={{ '--sidebar-width': '220px' } as React.CSSProperties}>
        <Sidebar
          channels={settings.channels}
          rooms={rooms}
          activeRoom={activeRoomName}
          email={session.email || ''}
          onJoin={joinChannel}
          onSettings={() => setSettingsOpen(true)}
          onSignOut={handleSignOut}
          visible={sidebarVisible}
        />

        <div className="video-area">
          {/* Game Mode exit strip */}
          {gameMode && (
            <div className="game-mode-strip" onClick={() => setGameMode(false)}>
              Click to exit Game Mode
            </div>
          )}

          {connectState === 'idle' && !connection && (
            <div className="empty-state">
              <div className="big-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--border)' }}>
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </div>
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

      {/* ── Call controls ─────────────────────────────────────────── */}
      <CallControls
        connected={!!connection}
        micMuted={micMuted}
        camMuted={camMuted}
        onToggleMic={() => setMicMuted(m => !m)}
        onToggleCam={() => setCamMuted(c => !c)}
        onHangup={handleHangup}
      />

      {/* ── Settings modal ────────────────────────────────────────── */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ── Top-bar icon SVGs ─────────────────────────────────────────────────────────

function BurgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function GameModeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <polyline points="8 21 12 17 16 21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
