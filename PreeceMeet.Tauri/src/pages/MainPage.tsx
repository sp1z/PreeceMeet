import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import type { Session, Settings, RoomConnection, RoomInfo, Channel } from '../types';
import { saveSettings, clearSession, saveSession } from '../settings';
import { getRooms, getRoomToken, UnauthorizedError } from '../api';
import Sidebar from '../components/Sidebar';
import VideoGrid from '../components/VideoGrid';
import CallControls from '../components/CallControls';
import SettingsModal from '../components/SettingsModal';
import AdminPanel from '../components/AdminPanel';

interface Props {
  session:          Session;
  settings:         Settings;
  onSettingsChange: (s: Settings) => void;
  onSignOut:        () => void;
  updateVersion?:   string;
}

type ConnectState = 'idle' | 'connecting' | 'connected';

export default function MainPage({ session, settings, onSettingsChange, onSignOut, updateVersion }: Props) {
  const [sidebarVisible, setSidebarVisible] = useState(settings.sidebarVisible);
  const [rooms,          setRooms]          = useState<RoomInfo[]>([]);
  const [connection,     setConnection]     = useState<RoomConnection | null>(null);
  const [connectState,   setConnectState]   = useState<ConnectState>('idle');
  const [micMuted,       setMicMuted]       = useState(false);
  const [camMuted,       setCamMuted]       = useState(false);
  const [error,          setError]          = useState('');
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [adminOpen,      setAdminOpen]      = useState(false);
  const [gameMode,       setGameMode]       = useState(false);
  const [installing,     setInstalling]     = useState(false);
  const pollRef     = useRef<ReturnType<typeof setInterval>>();
  const savedSizeRef = useRef<{ width: number; height: number } | null>(null);

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

  // Auto-join on mount if a channel is configured
  useEffect(() => {
    if (settings.autoJoinChannel) {
      const ch = settings.channels.find(c => c.name === settings.autoJoinChannel);
      if (ch) void joinChannel(ch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

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

  // ── Game mode ─────────────────────────────────────────────────────────────

  async function enterGameMode() {
    setGameMode(true);
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const size = await win.outerSize();
      const sf   = await win.scaleFactor();
      savedSizeRef.current = {
        width:  Math.round(size.width  / sf),
        height: Math.round(size.height / sf),
      };
      await win.setDecorations(false);
      await win.setAlwaysOnTop(true);
      await win.setResizable(false);
      await win.setSize(new LogicalSize(1280, 252));
    } catch { /* not in Tauri — ignore */ }
  }

  async function exitGameMode() {
    setGameMode(false);
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.setDecorations(true);
      await win.setAlwaysOnTop(false);
      await win.setResizable(true);
      if (savedSizeRef.current) {
        const { width, height } = savedSizeRef.current;
        await win.setSize(new LogicalSize(width, height));
      }
    } catch { /* not in Tauri — ignore */ }
  }

  async function installUpdate() {
    if (installing) return;
    setInstalling(true);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } catch { setInstalling(false); }
  }

  function handleSaveSettings(s: Settings) {
    onSettingsChange(s);
    saveSettings(s);
  }

  function handleSignOut() { clearSession(); onSignOut(); }

  function handleAdminSignOut() { clearSession(); onSignOut(); }

  const activeRoomName = connection?.roomName ?? null;

  // ── Game mode layout ──────────────────────────────────────────────────────

  if (gameMode) {
    return (
      <div className="app-layout game-mode">
        <div className="game-titlebar" data-tauri-drag-region="">
          <span className="game-titlebar-title">PreeceMeet</span>
          <button className="game-exit-btn" onClick={() => void exitGameMode()} title="Exit Game Mode">
            ⊞ Restore
          </button>
        </div>

        <div className="video-area game-video-area">
          {connectState === 'idle' && !connection && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              No active call — select a channel to join
            </div>
          )}
          {connectState === 'connecting' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <div className="spinner" style={{ width: 16, height: 16 }} /> Connecting…
            </div>
          )}
          {connection && (
            <LiveKitRoom
              key={connection.key}
              serverUrl={connection.url}
              token={connection.token}
              connect={true}
              audio={true}
              video={true}
              onDisconnected={handleDisconnected}
              onError={err => setError(err.message)}
              style={{ flex: 1, display: 'flex', minHeight: 0, height: '100%' }}
            >
              <MediaController
                micMuted={micMuted}
                camMuted={camMuted}
                preferredMicDeviceId={settings.preferredMicDeviceId}
                preferredCamDeviceId={settings.preferredCamDeviceId}
              />
              <RoomAudioRenderer />
              <VideoGrid gameMode />
            </LiveKitRoom>
          )}
        </div>
      </div>
    );
  }

  // ── Normal layout ─────────────────────────────────────────────────────────

  return (
    <div className="app-layout">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="top-bar">
        <button className="icon-btn" onClick={toggleSidebar} title="Toggle sidebar">
          <BurgerIcon />
        </button>
        <span className="room-name">
          {activeRoomName ? `#${activeRoomName}` : 'No active call'}
        </span>
        {error && <span style={{ fontSize: 12, color: '#ef5350', flex: 1 }}>{error}</span>}
        {updateVersion && !error && (
          <button
            className="update-pill"
            onClick={installUpdate}
            disabled={installing}
            title={`Update to v${updateVersion}`}
          >
            {installing ? 'Installing…' : `↑ v${updateVersion} available`}
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => void enterGameMode()}
          title="Game Mode — overlay strip for streaming"
        >
          <GameModeIcon />
        </button>
        {session.isAdmin && (
          <button className="icon-btn" onClick={() => setAdminOpen(true)} title="Admin Panel">
            <AdminIcon />
          </button>
        )}
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          <SettingsIcon />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className={`content-row${!sidebarVisible ? ' sidebar-hidden' : ''}`}
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
              audio={true}
              video={true}
              onDisconnected={handleDisconnected}
              onError={err => setError(err.message)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              <MediaController
                micMuted={micMuted}
                camMuted={camMuted}
                preferredMicDeviceId={settings.preferredMicDeviceId}
                preferredCamDeviceId={settings.preferredCamDeviceId}
              />
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

      {/* ── Modals ───────────────────────────────────────────────── */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {adminOpen && (
        <AdminPanel
          session={session}
          onClose={() => setAdminOpen(false)}
          onSignOut={handleAdminSignOut}
        />
      )}
    </div>
  );
}

// ── MediaController ───────────────────────────────────────────────────────────

interface MediaControllerProps {
  micMuted: boolean;
  camMuted: boolean;
  preferredMicDeviceId: string;
  preferredCamDeviceId: string;
}

function MediaController({ micMuted, camMuted, preferredMicDeviceId, preferredCamDeviceId }: MediaControllerProps) {
  const { localParticipant } = useLocalParticipant();
  const room    = useRoomContext();
  const mounted = useRef(false);

  // Apply preferred devices once on connect
  useEffect(() => {
    async function applyPreferredDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (preferredMicDeviceId) {
          const available = devices.some(d => d.kind === 'audioinput' && d.deviceId === preferredMicDeviceId);
          if (available) await room.switchActiveDevice('audioinput', preferredMicDeviceId);
        }
        if (preferredCamDeviceId) {
          const available = devices.some(d => d.kind === 'videoinput' && d.deviceId === preferredCamDeviceId);
          if (available) await room.switchActiveDevice('videoinput', preferredCamDeviceId);
        }
      } catch { /* falls back to default */ }
    }
    void applyPreferredDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    localParticipant?.setMicrophoneEnabled(!micMuted).catch(() => {});
  }, [micMuted, localParticipant]);

  useEffect(() => {
    if (!mounted.current) return;
    localParticipant?.setCameraEnabled(!camMuted).catch(() => {});
  }, [camMuted, localParticipant]);

  return null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function AdminIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
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
