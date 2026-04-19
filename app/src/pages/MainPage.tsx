import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import type { Session, Settings, RoomConnection, RoomInfo, Channel, ChatMessage } from '../types';
import { saveSettings, clearSession } from '../settings';
import { openExternal, installUpdate as runtimeInstallUpdate, windowCtl, displayShare, diagnostics, getPlatform, type DisplayShareSource, type Platform } from '../runtime';
import { getRooms, getRoomToken, UnauthorizedError } from '../api';
import { createLogger } from '../logger';
import { startLogUploader, stopLogUploader } from '../logUploader';
import Sidebar from '../components/Sidebar';
import VideoGrid, { GAME_SIZES, type GameSize } from '../components/VideoGrid';
import CallControls from '../components/CallControls';
import SettingsModal from '../components/SettingsModal';
import AdminPanel from '../components/AdminPanel';
import ChatPanel from '../components/ChatPanel';
import ContactsModal from '../components/ContactsModal';
import ScreenSharePicker from '../components/ScreenSharePicker';
import WindowControls from '../components/WindowControls';
import { IncomingCallModal, OutgoingCallModal } from '../components/CallRingModals';
import { useDirectCalling } from '../calling';

const CHAT_URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
const CHAT_TOPIC = 'chat';
const ROOMS_POLL_MS = 2000;

const uiLog     = createLogger('ui');
const callLog   = createLogger('call');
const deviceLog = createLogger('device');
const shareLog  = createLogger('share');
const gameLog   = createLogger('game');

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
  const [sidebarWidth,   setSidebarWidth]   = useState(settings.sidebarWidth ?? 220);
  const [rooms,          setRooms]          = useState<RoomInfo[]>([]);
  const [connection,     setConnection]     = useState<RoomConnection | null>(null);
  const [connectState,   setConnectState]   = useState<ConnectState>('idle');
  const [micMuted,       setMicMuted]       = useState(false);
  const [camMuted,       setCamMuted]       = useState(false);
  const [screenSharing,  setScreenSharing]  = useState(false);
  const [remoteSharing,  setRemoteSharing]  = useState(false);
  const [chatVisible,    setChatVisible]    = useState(false);
  const [chatMessages,   setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatUnread,     setChatUnread]     = useState(0);
  const [error,          setError]          = useState('');
  const [settingsOpen,      setSettingsOpen]      = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'channels' | 'permissions'>('profile');
  const [adminOpen,         setAdminOpen]          = useState(false);
  const [gameMode,       setGameMode]       = useState(false);
  const [gameSize,       setGameSize]       = useState<GameSize>('medium');
  const [showSelf,       setShowSelf]       = useState(false);
  const [installing,     setInstalling]     = useState(false);
  const [uiHidden,       setUiHidden]       = useState(false);
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [statsVisible,   setStatsVisible]   = useState(false);
  const [contactsOpen,   setContactsOpen]   = useState(false);
  const [shareSources,   setShareSources]   = useState<DisplayShareSource[] | null>(null);
  const [platform,       setPlatform]       = useState<Platform>('browser');

  const calling = useDirectCalling(session);

  const pollRef        = useRef<ReturnType<typeof setInterval>>();
  const resizingRef    = useRef(false);
  const settingsRef    = useRef(settings);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { sidebarWidthRef.current = sidebarWidth; }, [sidebarWidth]);

  // Probe platform once for window-control routing (Mac → native traffic
  // lights, Win/Linux → custom buttons). Tag the root element so per-OS CSS
  // (e.g. left-padding for macOS traffic lights) can apply.
  useEffect(() => {
    void getPlatform().then(p => {
      setPlatform(p);
      document.documentElement.classList.add(p);
      uiLog.info('platform detected', { platform: p, userAgent: navigator.userAgent });
    });
  }, []);

  // Start the log uploader so diagnostics make it to the server automatically.
  useEffect(() => {
    startLogUploader(session.serverUrl, session.sessionToken);
    uiLog.info('session started', { email: session.email, isAdmin: session.isAdmin, serverUrl: session.serverUrl });
    return () => { stopLogUploader(); };
  }, [session.serverUrl, session.sessionToken, session.email, session.isAdmin]);

  // Log + refresh on device change so hot-plugged cameras/mics appear without
  // a restart. Fires inside VirtualBox passthrough scenarios too.
  useEffect(() => {
    async function enumerate(reason: string) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams    = devices.filter(d => d.kind === 'videoinput').map(d => ({ id: d.deviceId, label: d.label }));
        const mics    = devices.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label }));
        const spks    = devices.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, label: d.label }));
        deviceLog.info(`enumerate (${reason})`, { cameras: cams, microphones: mics, speakers: spks });
      } catch (err) {
        deviceLog.error(`enumerate failed (${reason})`, err);
      }
    }
    void enumerate('startup');
    const handler = () => { void enumerate('devicechange'); };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => { navigator.mediaDevices?.removeEventListener?.('devicechange', handler); };
  }, []);

  useEffect(() => {
    if (settings.sidebarWidth !== undefined && settings.sidebarWidth !== sidebarWidth) {
      setSidebarWidth(settings.sidebarWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sidebarWidth]);

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
    pollRef.current = setInterval(() => void pollRooms(), ROOMS_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [pollRooms]);

  useEffect(() => {
    if (settings.autoJoinChannel) {
      const ch = settings.channels.find(c => c.name === settings.autoJoinChannel);
      if (ch) void joinChannel(ch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); void toggleFullscreen(); return; }
      if (!e.ctrlKey) return;
      switch (e.key.toLowerCase()) {
        case 'm': e.preventDefault(); if (connection) setMicMuted(m => !m); break;
        case 'e': e.preventDefault(); if (connection) setCamMuted(c => !c); break;
        case 'd': e.preventDefault(); if (connection) handleHangup();       break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, connection]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(160, Math.min(480, e.clientX));
      setSidebarWidth(newWidth);
      sidebarWidthRef.current = newWidth;
    };
    const onMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      const updated = { ...settingsRef.current, sidebarWidth: sidebarWidthRef.current };
      onSettingsChange(updated);
      saveSettings(updated);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onSettingsChange]);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      try {
        const now = await windowCtl.toggleFullscreen();
        setIsFullscreen(now);
      } catch { /* ignore */ }
    }
  }

  function handleSidebarMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    resizingRef.current = true;
  }

  async function joinChannel(channel: Channel) {
    if (connection?.roomName === channel.name) return;
    callLog.info('join channel', { channel: channel.name });
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
      setScreenSharing(false);
      setRemoteSharing(false);
      setChatMessages([]);
      setChatUnread(0);
      callLog.info('got room token', { channel: channel.name, livekitUrl: result.livekitUrl });
      // Refresh participant counts immediately rather than waiting for the
      // next poll tick — gives an instant sidebar update for the joiner.
      void pollRooms();
    } catch (err) {
      if (err instanceof UnauthorizedError) { clearSession(); onSignOut(); return; }
      setConnectState('idle');
      callLog.error('join failed', err);
      setError(err instanceof Error ? err.message : 'Could not join room.');
    }
  }

  function resetCallState() {
    setConnection(null);
    setConnectState('idle');
    setScreenSharing(false);
    setRemoteSharing(false);
    setChatMessages([]);
    setChatUnread(0);
    setChatVisible(false);
    void pollRooms();
  }

  function handleHangup()       { callLog.info('user hangup'); resetCallState(); }
  function handleDisconnected() { callLog.info('livekit disconnected'); resetCallState(); }

  useEffect(() => {
    return calling.onAccepted(({ roomName, livekitToken, livekitUrl }) => {
      setError('');
      setConnection({ key: `${roomName}-${Date.now()}`, url: livekitUrl, token: livekitToken, roomName });
      setConnectState('connected');
      setMicMuted(false);
      setCamMuted(false);
      setScreenSharing(false);
      setRemoteSharing(false);
      setChatMessages([]);
      setChatUnread(0);
      void pollRooms();
    });
  }, [calling, pollRooms]);

  useEffect(() => {
    return calling.onDeclined(() => setError('Call declined'));
  }, [calling]);

  useEffect(() => {
    return calling.onCancelled(() => { /* nothing extra */ });
  }, [calling]);

  function toggleChat() {
    setChatVisible(v => {
      if (!v) setChatUnread(0);
      return !v;
    });
  }

  const handleIncomingChat = useCallback((msg: ChatMessage) => {
    setChatMessages(prev => [...prev, msg]);
    if (!msg.isLocal) {
      if (!chatVisible) setChatUnread(u => u + 1);
      if (settingsRef.current.autoOpenChatUrls) {
        const urls = msg.text.match(CHAT_URL_RE);
        if (urls) {
          // Serialize so e.g. Firefox on Linux doesn't get hammered with
          // concurrent xdg-open calls (races its profile lock and "stalls").
          void (async () => {
            for (const url of urls) {
              try { await openExternal(url); } catch { /* ignore */ }
              await new Promise(r => setTimeout(r, 250));
            }
          })();
        }
      }
    }
  }, [chatVisible]);

  const chatSendRef = useRef<((text: string) => void) | null>(null);
  function handleSendChat(text: string) { chatSendRef.current?.(text); }

  function toggleSidebar() {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    const updated = { ...settings, sidebarVisible: next };
    onSettingsChange(updated);
    saveSettings(updated);
  }

  // ── Game mode ─────────────────────────────────────────────────────────────
  // The window is sized + locked here; tile rendering is handled by VideoGrid
  // and the live participant count comes from GameModeAutoSize (inside the
  // LiveKitRoom). The LiveKitRoom itself stays mounted across mode toggles
  // so toggling Game Mode while sharing doesn't re-fire getDisplayMedia.

  async function enterGameMode() {
    gameLog.info('enter game mode', { gameSize, showSelf });
    try { await windowCtl.saveBounds(); } catch (e) { gameLog.warn('saveBounds failed', e); }
    try { await windowCtl.setAlwaysOnTop(true); } catch (e) { gameLog.warn('setAlwaysOnTop failed', e); }
    try { await windowCtl.setResizable(false); } catch (e) { gameLog.warn('setResizable failed', e); }
    try { await windowCtl.setWindowButtonVisibility(false); } catch { /* mac only */ }
    setGameMode(true);
  }

  async function exitGameMode() {
    gameLog.info('exit game mode');
    setGameMode(false);
    try { await windowCtl.setAlwaysOnTop(false); } catch (e) { gameLog.warn('setAlwaysOnTop(false) failed', e); }
    try { await windowCtl.setResizable(true); }   catch (e) { gameLog.warn('setResizable(true) failed', e); }
    try { await windowCtl.setWindowButtonVisibility(true); } catch { /* mac only */ }
    try { await windowCtl.restoreBounds(); }      catch (e) { gameLog.warn('restoreBounds failed', e); }
  }

  // ── Screen-share picker ───────────────────────────────────────────────────
  useEffect(() => {
    const off = displayShare.onRequest(sources => {
      shareLog.info('picker request', {
        count:   sources.length,
        screens: sources.filter(s => s.isScreen).length,
        windows: sources.filter(s => !s.isScreen).length,
        names:   sources.map(s => s.name),
      });
      setShareSources(sources);
    });
    return off;
  }, []);

  function handleSharePick(sourceId: string) {
    const picked = shareSources?.find(s => s.id === sourceId);
    shareLog.info('picker pick', { sourceId, name: picked?.name, isScreen: picked?.isScreen });
    setShareSources(null);
    void displayShare.choose(sourceId);
  }

  function handleShareCancel() {
    shareLog.info('picker cancel');
    setShareSources(null);
    void displayShare.cancel();
    setScreenSharing(false);
  }

  async function installUpdate() {
    if (installing) return;
    setInstalling(true);
    try {
      const r = await runtimeInstallUpdate();
      if (r.ok) return;
      setInstalling(false);
      console.error('[updater]', r.error);
      setError(`Update failed: ${r.error}`);
    } catch (e) {
      console.error('[updater] failed:', e);
      setInstalling(false);
      const name = e instanceof Error ? e.name : 'Error';
      const msg  = e instanceof Error ? e.message : String(e);
      setError(`Update failed (${name}): ${msg}`);
    }
  }

  function openSettingsAt(tab: 'profile' | 'channels' | 'permissions') {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  }

  function handleDeleteChannel(channelName: string) {
    const updated = {
      ...settings,
      channels: settings.channels.filter(c => c.name !== channelName),
      autoJoinChannel: settings.autoJoinChannel === channelName ? '' : settings.autoJoinChannel,
    };
    onSettingsChange(updated);
    saveSettings(updated);
    if (connection?.roomName === channelName) handleHangup();
  }

  function handleSaveSettings(s: Settings) {
    onSettingsChange({ ...s, sidebarWidth: sidebarWidthRef.current });
    saveSettings({ ...s, sidebarWidth: sidebarWidthRef.current });
  }

  const handleSignOut = useCallback(() => { clearSession(); onSignOut(); }, [onSignOut]);

  const activeRoomName = connection?.roomName ?? null;
  const showWinControls = platform === 'win32' || platform === 'linux';
  const showChat = chatVisible && !!connection && !gameMode;
  const sidebarOn = sidebarVisible && !gameMode;
  const contentColumns = gameMode
    ? '1fr'
    : (sidebarOn ? `${sidebarWidth}px 6px 1fr` : '1fr') + (showChat ? ' 320px' : '');

  return (
    <div className={`app-layout${gameMode ? ' game-mode' : ''}${uiHidden ? ' ui-hidden' : ''}`}>

      {/* ── Top bar: game-mode title bar OR normal top bar ─────────────────── */}
      {gameMode ? (
        <GameTitleBar
          gameSize={gameSize}
          onSizeChange={setGameSize}
          showSelf={showSelf}
          onToggleSelf={() => setShowSelf(v => !v)}
          onRestore={() => void exitGameMode()}
          showWinControls={showWinControls}
        />
      ) : !uiHidden ? (
        <div className="top-bar">
          <button className="icon-btn nodrag" onClick={toggleSidebar} title="Toggle sidebar">
            <BurgerIcon />
          </button>
          <span className="room-name">
            {activeRoomName ? `#${activeRoomName}` : 'No active call'}
          </span>
          {error && <span className="top-error">{error}</span>}
          {updateVersion && !error && (
            <button
              className="update-pill nodrag"
              onClick={installUpdate}
              disabled={installing}
              title={`Update to v${updateVersion}`}
            >
              {installing ? 'Installing…' : `↑ v${updateVersion} available`}
            </button>
          )}
          <button className="icon-btn nodrag" onClick={() => void enterGameMode()} title="Game Mode — overlay strip for streaming">
            <GameModeIcon />
          </button>
          <button className={`icon-btn nodrag${statsVisible ? ' active' : ''}`} onClick={() => setStatsVisible(v => !v)} title="Toggle stats panel">
            📊
          </button>
          <button className={`icon-btn nodrag${isFullscreen ? ' active' : ''}`} onClick={() => void toggleFullscreen()} title={isFullscreen ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'}>
            <FullscreenIcon exit={isFullscreen} />
          </button>
          <button className="icon-btn nodrag" onClick={() => setUiHidden(true)} title="Hide UI">
            ↕
          </button>
          <button className="icon-btn nodrag" onClick={() => setContactsOpen(true)} title="Contacts — direct call other users">
            <ContactsIcon />
          </button>
          {session.isAdmin && (
            <button className="icon-btn nodrag" onClick={() => setAdminOpen(true)} title="Admin Panel">
              <AdminIcon />
            </button>
          )}
          {connection && (
            <button
              className={`icon-btn nodrag${chatVisible ? ' active' : ''}`}
              onClick={toggleChat}
              title="Chat"
              style={{ position: 'relative' }}
            >
              <ChatIcon />
              {chatUnread > 0 && !chatVisible && (
                <span className="chat-unread-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>
              )}
            </button>
          )}
          <button
            className="icon-btn nodrag"
            onClick={() => void diagnostics.openLogFolder()}
            title="Open logs folder"
          >
            <LogIcon />
          </button>
          <button
            className="icon-btn nodrag"
            onClick={() => void diagnostics.toggleDevTools()}
            title="Toggle DevTools (F12)"
          >
            <BugIcon />
          </button>
          <button className="icon-btn nodrag" onClick={() => setSettingsOpen(true)} title="Settings">
            <SettingsIcon />
          </button>
          {showWinControls && <WindowControls />}
        </div>
      ) : null}

      {/* ── Content ──────────────────────────────────────────────── */}
      <div
        className={`content-row${gameMode ? ' content-row-game' : ''}`}
        style={!gameMode ? { gridTemplateColumns: contentColumns } : undefined}
      >
        {sidebarOn && (
          <Sidebar
            channels={settings.channels}
            rooms={rooms}
            activeRoom={activeRoomName}
            email={session.email || ''}
            onJoin={joinChannel}
            onSettings={() => openSettingsAt('profile')}
            onSignOut={handleSignOut}
            onAddChannel={() => openSettingsAt('channels')}
            onDeleteChannel={handleDeleteChannel}
            visible={true}
          />
        )}
        {sidebarOn && (
          <div className="sidebar-resize-handle" onMouseDown={handleSidebarMouseDown} />
        )}

        <div className={`video-area${gameMode ? ' game-video-area' : ''}`}>
          {!gameMode && connectState === 'idle' && !connection && (
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

          {gameMode && connectState === 'idle' && !connection && (
            <div className="game-empty">No active call — restore window to join a channel</div>
          )}

          {!gameMode && connectState === 'connecting' && (
            <div className="overlay">
              <div className="overlay-card">
                <div className="spinner" />
                <h3>Connecting…</h3>
                <p>Joining room</p>
              </div>
            </div>
          )}

          {gameMode && connectState === 'connecting' && (
            <div className="game-empty">
              <div className="spinner" style={{ width: 14, height: 14, marginBottom: 0 }} /> Connecting…
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
              onConnected={() => callLog.info('livekit connected', { room: connection.roomName })}
              onDisconnected={handleDisconnected}
              onError={err => { callLog.error('livekit error', err); setError(err.message); }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}
            >
              <RoomEventLogger />
              <MediaController
                micMuted={micMuted}
                camMuted={camMuted}
                screenSharing={screenSharing}
                preferredMicDeviceId={settings.preferredMicDeviceId}
                preferredCamDeviceId={settings.preferredCamDeviceId}
                preferredSpeakerDeviceId={settings.preferredSpeakerDeviceId}
                displayName={settings.displayName}
                onLocalShareEnded={() => setScreenSharing(false)}
                onRemoteShareChange={setRemoteSharing}
                onShareError={msg => { setError(msg); setScreenSharing(false); }}
              />
              <ChatBridge
                displayName={settings.displayName}
                onMessage={handleIncomingChat}
                sendRef={chatSendRef}
              />
              {gameMode && <GameModeAutoSize gameSize={gameSize} showSelf={showSelf} />}
              <RoomAudioRenderer />
              <VideoGrid
                gameMode={gameMode}
                gameSize={gameSize}
                showSelf={showSelf}
                statsVisible={statsVisible}
              />
            </LiveKitRoom>
          )}
        </div>

        {showChat && (
          <ChatPanel
            messages={chatMessages}
            onSend={handleSendChat}
            onClose={() => setChatVisible(false)}
          />
        )}
      </div>

      {/* ── Bottom controls / reveal bar (normal mode only) ────────────────── */}
      {!gameMode && (uiHidden ? (
        <div className="reveal-bar" onClick={() => setUiHidden(false)}>
          ▲&nbsp;&nbsp;Click to restore toolbar
        </div>
      ) : (
        <CallControls
          connected={!!connection}
          micMuted={micMuted}
          camMuted={camMuted}
          screenSharing={screenSharing}
          screenShareDisabled={remoteSharing}
          onToggleMic={() => setMicMuted(m => !m)}
          onToggleCam={() => setCamMuted(c => !c)}
          onToggleScreenShare={() => setScreenSharing(s => !s)}
          onHangup={handleHangup}
        />
      ))}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsInitialTab}
        />
      )}
      {adminOpen && (
        <AdminPanel
          session={session}
          onClose={() => setAdminOpen(false)}
          onSignOut={handleSignOut}
        />
      )}
      {contactsOpen && (
        <ContactsModal
          session={session}
          online={calling.online}
          inCall={!!connection}
          onCall={calling.call}
          onClose={() => setContactsOpen(false)}
          onSignOut={handleSignOut}
        />
      )}
      {calling.incoming && (
        <IncomingCallModal
          call={calling.incoming}
          onAccept={() => void calling.accept()}
          onDecline={() => void calling.decline()}
        />
      )}
      {calling.outgoing && (
        <OutgoingCallModal
          call={calling.outgoing}
          onCancel={() => void calling.cancel()}
        />
      )}

      {shareSources && (
        <ScreenSharePicker
          sources={shareSources}
          onSelect={handleSharePick}
          onCancel={handleShareCancel}
        />
      )}
    </div>
  );
}

// ── Game mode title bar ──────────────────────────────────────────────────────

interface GameTitleBarProps {
  gameSize:        GameSize;
  onSizeChange:    (s: GameSize) => void;
  showSelf:        boolean;
  onToggleSelf:    () => void;
  onRestore:       () => void;
  showWinControls: boolean;
}

function GameTitleBar({ gameSize, onSizeChange, showSelf, onToggleSelf, onRestore, showWinControls }: GameTitleBarProps) {
  const sizes: { key: GameSize; label: string }[] = [
    { key: 'small',  label: 'S' },
    { key: 'medium', label: 'M' },
    { key: 'large',  label: 'L' },
  ];
  return (
    <div className="game-titlebar">
      <div className="game-size-buttons">
        {sizes.map(s => (
          <button
            key={s.key}
            className={`game-size-btn nodrag${gameSize === s.key ? ' active' : ''}`}
            onClick={() => onSizeChange(s.key)}
            title={`${s.label} — ${GAME_SIZES[s.key]}px tall`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        className={`game-self-btn nodrag${showSelf ? ' active' : ''}`}
        onClick={onToggleSelf}
        title={showSelf ? 'Hide my own video' : 'Show my own video'}
      >
        <SelfIcon /> Self
      </button>
      <span className="game-titlebar-title">PreeceMeet</span>
      <button className="game-exit-btn nodrag" onClick={onRestore} title="Exit Game Mode">
        ⊞ Restore
      </button>
      {showWinControls && <WindowControls />}
    </div>
  );
}

// ── Game mode auto-size ──────────────────────────────────────────────────────
// Fits the window content area to (visible-tile-count × tile-width) horizontally
// and (titlebar + tile-height + padding) vertically. Counts the same set
// VideoGrid renders: cameras only, with self filtered unless Show Self is on.

function GameModeAutoSize({ gameSize, showSelf }: { gameSize: GameSize; showSelf: boolean }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const visible = tracks.filter(t => showSelf || !t.participant.isLocal);
  const count   = Math.max(1, visible.length);

  useEffect(() => {
    const tileH      = GAME_SIZES[gameSize];
    const tileW      = Math.round((tileH * 16) / 9);
    const gap        = 4;
    const pad        = 4;
    const titleBarH  = 30;
    const minBarW    = 360; // keeps S/M/L + Self + Restore visible at idle
    const contentW   = Math.max(minBarW, pad * 2 + count * tileW + (count - 1) * gap);
    const contentH   = titleBarH + tileH + pad * 2;
    void windowCtl.setContentSize(contentW, contentH);
  }, [count, gameSize]);

  return null;
}

// ── RoomEventLogger ───────────────────────────────────────────────────────────
// Bridges LiveKit room events into our logger so the server sees connection
// churn, track publish/unpublish, and participant join/leave without us
// having to infer it from state shape.

function RoomEventLogger() {
  const room = useRoomContext();

  useEffect(() => {
    const onState = (state: ConnectionState) => callLog.info('connection state', { state });
    const onJoin  = (p: { identity: string; name?: string; sid: string }) =>
      callLog.info('participant connected', { identity: p.identity, name: p.name, sid: p.sid });
    const onLeave = (p: { identity: string; sid: string }) =>
      callLog.info('participant disconnected', { identity: p.identity, sid: p.sid });
    const onLocalPub = (pub: { kind: string; source?: string }) =>
      callLog.info('local track published', { kind: pub.kind, source: pub.source });
    const onLocalUnpub = (pub: { kind: string; source?: string }) =>
      callLog.info('local track unpublished', { kind: pub.kind, source: pub.source });
    const onMediaErr = (err: unknown) => callLog.error('media device failure', err);
    const onReconnecting = () => callLog.warn('livekit reconnecting');
    const onReconnected  = () => callLog.info('livekit reconnected');

    room.on(RoomEvent.ConnectionStateChanged,    onState);
    room.on(RoomEvent.ParticipantConnected,      onJoin);
    room.on(RoomEvent.ParticipantDisconnected,   onLeave);
    room.on(RoomEvent.LocalTrackPublished,       onLocalPub);
    room.on(RoomEvent.LocalTrackUnpublished,     onLocalUnpub);
    room.on(RoomEvent.MediaDevicesError,         onMediaErr);
    room.on(RoomEvent.Reconnecting,              onReconnecting);
    room.on(RoomEvent.Reconnected,               onReconnected);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged,    onState);
      room.off(RoomEvent.ParticipantConnected,      onJoin);
      room.off(RoomEvent.ParticipantDisconnected,   onLeave);
      room.off(RoomEvent.LocalTrackPublished,       onLocalPub);
      room.off(RoomEvent.LocalTrackUnpublished,     onLocalUnpub);
      room.off(RoomEvent.MediaDevicesError,         onMediaErr);
      room.off(RoomEvent.Reconnecting,              onReconnecting);
      room.off(RoomEvent.Reconnected,               onReconnected);
    };
  }, [room]);

  return null;
}

// ── MediaController ───────────────────────────────────────────────────────────

interface MediaControllerProps {
  micMuted: boolean;
  camMuted: boolean;
  screenSharing: boolean;
  preferredMicDeviceId: string;
  preferredCamDeviceId: string;
  preferredSpeakerDeviceId: string;
  displayName: string;
  onLocalShareEnded:   () => void;
  onRemoteShareChange: (sharing: boolean) => void;
  onShareError:        (msg: string) => void;
}

function MediaController({
  micMuted,
  camMuted,
  screenSharing,
  preferredMicDeviceId,
  preferredCamDeviceId,
  preferredSpeakerDeviceId,
  displayName,
  onLocalShareEnded,
  onRemoteShareChange,
  onShareError,
}: MediaControllerProps) {
  const { localParticipant } = useLocalParticipant();
  const room    = useRoomContext();
  const mounted = useRef(false);

  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const remoteSharing = screenTracks.some(t => !t.participant.isLocal);

  useEffect(() => { onRemoteShareChange(remoteSharing); }, [remoteSharing, onRemoteShareChange]);

  useEffect(() => {
    const handler = (publication: { source?: Track.Source } | undefined) => {
      if (publication?.source === Track.Source.ScreenShare) onLocalShareEnded();
    };
    room.on(RoomEvent.LocalTrackUnpublished, handler);
    return () => { room.off(RoomEvent.LocalTrackUnpublished, handler); };
  }, [room, onLocalShareEnded]);

  const desiredShareRef = useRef(false);
  useEffect(() => {
    if (!localParticipant) return;
    if (desiredShareRef.current === screenSharing) return;
    desiredShareRef.current = screenSharing;
    shareLog.info('setScreenShareEnabled', { enable: screenSharing });
    localParticipant.setScreenShareEnabled(screenSharing).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Permission denied|aborted|cancel|NotAllowedError/i.test(msg)) {
        shareLog.info('screen share cancelled by user', { msg });
        desiredShareRef.current = false;
        onLocalShareEnded();
      } else {
        shareLog.error('screen share failed', err);
        desiredShareRef.current = false;
        onShareError(msg);
      }
    });
  }, [screenSharing, localParticipant, onLocalShareEnded, onShareError]);

  useEffect(() => {
    async function applyPreferredDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (preferredMicDeviceId) {
          const ok = devices.some(d => d.kind === 'audioinput' && d.deviceId === preferredMicDeviceId);
          if (ok) {
            await room.switchActiveDevice('audioinput', preferredMicDeviceId);
            deviceLog.info('switched microphone', { deviceId: preferredMicDeviceId });
          } else {
            deviceLog.warn('preferred microphone not available', { deviceId: preferredMicDeviceId });
          }
        }
        if (preferredCamDeviceId) {
          const ok = devices.some(d => d.kind === 'videoinput' && d.deviceId === preferredCamDeviceId);
          if (ok) {
            await room.switchActiveDevice('videoinput', preferredCamDeviceId);
            deviceLog.info('switched camera', { deviceId: preferredCamDeviceId });
          } else {
            deviceLog.warn('preferred camera not available', { deviceId: preferredCamDeviceId });
          }
        }
        if (preferredSpeakerDeviceId) {
          const ok = devices.some(d => d.kind === 'audiooutput' && d.deviceId === preferredSpeakerDeviceId);
          if (ok) {
            await room.switchActiveDevice('audiooutput', preferredSpeakerDeviceId);
            deviceLog.info('switched speaker', { deviceId: preferredSpeakerDeviceId });
          } else {
            deviceLog.warn('preferred speaker not available', { deviceId: preferredSpeakerDeviceId });
          }
        }
      } catch (err) {
        deviceLog.error('applyPreferredDevices failed', err);
      }
    }
    void applyPreferredDevices();
  }, [preferredMicDeviceId, preferredCamDeviceId, preferredSpeakerDeviceId, room]);

  useEffect(() => {
    if (displayName) room.localParticipant.setName(displayName).catch(() => {});
  }, [displayName, room]);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    deviceLog.info('mic toggled', { muted: micMuted });
    localParticipant?.setMicrophoneEnabled(!micMuted).catch(err => deviceLog.error('setMicrophoneEnabled failed', err));
  }, [micMuted, localParticipant]);

  useEffect(() => {
    if (!mounted.current) return;
    deviceLog.info('camera toggled', { muted: camMuted });
    localParticipant?.setCameraEnabled(!camMuted).catch(err => deviceLog.error('setCameraEnabled failed', err));
  }, [camMuted, localParticipant]);

  return null;
}

// ── ChatBridge ────────────────────────────────────────────────────────────────

interface ChatBridgeProps {
  displayName: string;
  onMessage:   (msg: ChatMessage) => void;
  sendRef:     React.MutableRefObject<((text: string) => void) | null>;
}

function ChatBridge({ displayName, onMessage, sendRef }: ChatBridgeProps) {
  const room = useRoomContext();
  const onMessageRef   = useRef(onMessage);
  const displayNameRef = useRef(displayName);

  useEffect(() => { onMessageRef.current   = onMessage; },   [onMessage]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  useEffect(() => {
    sendRef.current = (text: string) => {
      const msg = {
        id:        crypto.randomUUID(),
        text,
        timestamp: Date.now(),
        fromName:  displayNameRef.current,
      };
      const bytes = new TextEncoder().encode(JSON.stringify(msg));
      void room.localParticipant.publishData(bytes, { reliable: true, topic: CHAT_TOPIC });
      onMessageRef.current({
        ...msg,
        from:    room.localParticipant.identity,
        isLocal: true,
      });
    };
    return () => { sendRef.current = null; };
  }, [room, sendRef]);

  useEffect(() => {
    const handler = (payload: Uint8Array, participant: { identity: string; name?: string } | undefined, _kind: unknown, topic?: string) => {
      if (topic !== CHAT_TOPIC) return;
      try {
        const decoded = JSON.parse(new TextDecoder().decode(payload));
        if (typeof decoded?.text !== 'string') return;
        onMessageRef.current({
          id:        decoded.id || crypto.randomUUID(),
          from:      participant?.identity ?? 'unknown',
          fromName:  decoded.fromName || participant?.name || participant?.identity || 'unknown',
          text:      decoded.text,
          timestamp: typeof decoded.timestamp === 'number' ? decoded.timestamp : Date.now(),
          isLocal:   false,
        });
      } catch { /* malformed — ignore */ }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room]);

  return null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FullscreenIcon({ exit }: { exit: boolean }) {
  return exit ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
    </svg>
  );
}

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

function ContactsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
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

function SelfIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8"  y1="13" x2="16" y2="13"/>
      <line x1="8"  y1="17" x2="13" y2="17"/>
    </svg>
  );
}

function BugIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.88 1.88"/>
      <path d="M14.12 3.88 16 2"/>
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/>
      <path d="M12 20v-9"/>
      <path d="M6.53 9H2"/>
      <path d="M6 13H2"/>
      <path d="M6 17h-4"/>
      <path d="M22 9h-4.5"/>
      <path d="M22 13h-4"/>
      <path d="M22 17h-4"/>
    </svg>
  );
}
