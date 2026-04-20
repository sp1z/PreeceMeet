import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import DeviceFallbackBanner from '../components/DeviceFallbackBanner';
import ConnectingPanel from '../components/ConnectingPanel';
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
const ROOMS_POLL_MS = 1000;

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
  const [contactsOpen,   setContactsOpen]   = useState(false);
  const [shareSources,   setShareSources]   = useState<DisplayShareSource[] | null>(null);
  const [platform,       setPlatform]       = useState<Platform>('browser');
  const [deviceFallbacks, setDeviceFallbacks] = useState<DeviceKind[]>([]);
  const [deviceRetryNonce, setDeviceRetryNonce] = useState(0);
  const [videoReady,       setVideoReady]       = useState(false);

  const calling = useDirectCalling(session);

  const pollRef        = useRef<ReturnType<typeof setInterval>>();
  const pollRoomsRef   = useRef<() => Promise<void>>();
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
  // a restart. Fires inside VirtualBox passthrough scenarios too. Also bumps
  // the device-retry nonce so MediaController reruns applyPreferredDevices —
  // the preferred device may have just reappeared.
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
    const handler = () => {
      void enumerate('devicechange');
      setDeviceRetryNonce(n => n + 1);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => { navigator.mediaDevices?.removeEventListener?.('devicechange', handler); };
  }, []);

  useEffect(() => {
    if (settings.sidebarWidth !== undefined && settings.sidebarWidth !== sidebarWidth) {
      setSidebarWidth(settings.sidebarWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sidebarWidth]);

  // Stable LiveKitRoom audio/video options — passing a fresh object literal
  // each render risks LiveKit re-doing gUM and switching back to the system
  // default (which is what we were debugging with NVIDIA Broadcast).
  const liveKitAudio = useMemo(
    () => settings.preferredMicDeviceId
      ? { deviceId: settings.preferredMicDeviceId }
      : true,
    [settings.preferredMicDeviceId],
  );
  const liveKitVideo = useMemo(
    () => settings.preferredCamDeviceId
      ? { deviceId: settings.preferredCamDeviceId }
      : true,
    [settings.preferredCamDeviceId],
  );

  const handleVideoReady = useCallback(() => setVideoReady(true), []);
  const handleParticipantsChanged = useCallback(() => { void pollRoomsRef.current?.(); }, []);
  const handleForceMicMute = useCallback((from: string) => {
    callLog.info('forced mute by remote', { from });
    setMicMuted(true);
  }, []);

  const pollRooms = useCallback(async () => {
    try {
      const list = await getRooms(session.serverUrl, session.sessionToken);
      setRooms(list);
    } catch (e) {
      if (e instanceof UnauthorizedError) { clearSession(); onSignOut(); }
    }
  }, [session, onSignOut]);

  useEffect(() => {
    pollRoomsRef.current = pollRooms;
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
    // Prefer the Electron BrowserWindow fullscreen path: document.requestFullscreen
    // doesn't play well with frameless + always-on-top windows (what Game Mode
    // leaves behind) and silently no-ops on some Linux WMs. setFullScreen on
    // the BrowserWindow always works.
    if (platform !== 'browser') {
      try {
        const now = await windowCtl.toggleFullscreen();
        setIsFullscreen(now);
        uiLog.info('fullscreen toggled (window)', { fullscreen: now });
        return;
      } catch (err) {
        uiLog.warn('windowCtl.toggleFullscreen failed, falling back to document API', err);
      }
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        uiLog.info('fullscreen toggled (document) → on');
      } else {
        await document.exitFullscreen();
        uiLog.info('fullscreen toggled (document) → off');
      }
    } catch (err) {
      uiLog.error('fullscreen toggle failed', err);
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
    setVideoReady(false);
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
    setVideoReady(false);
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
      setVideoReady(false);
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
  //
  // Position memory: while in game mode we persist {x,y} to localStorage on
  // every move. Re-entering game mode restores the last position via
  // setPositionNormalized — which clamps to the active display's work area
  // so the window can never end up off-screen (e.g. monitor unplugged).

  const GAME_POS_KEY = 'preecemeet_game_pos';

  // Save position only while in game mode (gameModeRef avoids stale closures
  // inside the long-lived onMoved subscription).
  const gameModeRef = useRef(gameMode);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  useEffect(() => {
    const off = windowCtl.onMoved(({ x, y }) => {
      if (!gameModeRef.current) return;
      try { localStorage.setItem(GAME_POS_KEY, JSON.stringify({ x, y })); } catch { /* ignore */ }
    });
    return off;
  }, []);

  async function enterGameMode() {
    gameLog.info('enter game mode', { gameSize, showSelf });
    // Exit OS-level fullscreen first — otherwise the auto-sized small bar
    // gets pinned to the top-left of the fullscreen rect with the rest of
    // the screen black. Browser fullscreen and Electron BrowserWindow
    // fullscreen are separate; clear both.
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* ignore */ }
    try {
      if (await windowCtl.isFullscreen()) {
        await windowCtl.toggleFullscreen();
        setIsFullscreen(false);
      }
    } catch { /* ignore */ }

    try { await windowCtl.saveBounds(); } catch (e) { gameLog.warn('saveBounds failed', e); }
    try { await windowCtl.setAlwaysOnTop(true); } catch (e) { gameLog.warn('setAlwaysOnTop failed', e); }
    try { await windowCtl.setResizable(false); } catch (e) { gameLog.warn('setResizable failed', e); }
    try { await windowCtl.setWindowButtonVisibility(false); } catch { /* mac only */ }
    setGameMode(true);

    // Restore last game-mode position. Wait one frame so GameModeAutoSize has
    // applied the new content size before we move (ordering matters because
    // setPositionNormalized clamps using the *current* width/height).
    requestAnimationFrame(async () => {
      try {
        const raw = localStorage.getItem(GAME_POS_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved?.x !== 'number' || typeof saved?.y !== 'number') return;
        const applied = await windowCtl.setPositionNormalized(saved.x, saved.y);
        gameLog.info('restored game-mode position', { saved, applied });
      } catch (e) {
        gameLog.warn('restore game-mode position failed', e);
      }
    });
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
            displayName={settings.displayName || ''}
            avatarEmoji={settings.avatarEmoji || '🙂'}
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
          {!gameMode && connection && deviceFallbacks.length > 0 && (
            <DeviceFallbackBanner
              failures={deviceFallbacks}
              onRetry={() => setDeviceRetryNonce(n => n + 1)}
              onOpenSettings={() => openSettingsAt('permissions')}
            />
          )}
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

          {gameMode && connectState === 'connecting' && (
            <div className="game-empty">
              <div className="spinner" style={{ width: 14, height: 14, marginBottom: 0 }} /> Connecting…
            </div>
          )}

          {!gameMode && (
            <ConnectingPanel
              visible={
                connectState === 'connecting' ||
                (connectState === 'connected' && !videoReady)
              }
              subLabel={connection ? `Joining #${connection.roomName}` : undefined}
            />
          )}

          {connection && (
            <LiveKitRoom
              key={connection.key}
              serverUrl={connection.url}
              token={connection.token}
              connect={true}
              audio={liveKitAudio}
              video={liveKitVideo}
              onConnected={() => callLog.info('livekit connected', { room: connection.roomName })}
              onDisconnected={handleDisconnected}
              onError={err => { callLog.error('livekit error', err); setError(err.message); }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}
            >
              <RoomEventLogger onVideoReady={handleVideoReady} onParticipantsChanged={handleParticipantsChanged} />
              <MediaController
                micMuted={micMuted}
                camMuted={camMuted}
                screenSharing={screenSharing}
                preferredMicDeviceId={settings.preferredMicDeviceId}
                preferredCamDeviceId={settings.preferredCamDeviceId}
                preferredSpeakerDeviceId={settings.preferredSpeakerDeviceId}
                displayName={settings.displayName}
                avatarEmoji={settings.avatarEmoji || '🙂'}
                retryNonce={deviceRetryNonce}
                onLocalShareEnded={() => setScreenSharing(false)}
                onRemoteShareChange={setRemoteSharing}
                onShareError={msg => { setError(msg); setScreenSharing(false); }}
                onDeviceFallback={setDeviceFallbacks}
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
                showSpeakingIndicator={settings.showSpeakingIndicator}
                onForceMicMute={handleForceMicMute}
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
          onCall={email => calling.call(email, settings.displayName || undefined)}
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
// having to infer it from state shape. Also signals "video ready" upward
// so MainPage can dismiss the connecting panel — fired when the local
// camera publishes, or as a fallback 4s after the room reaches `connected`.

const VIDEO_READY_FALLBACK_MS = 4000;

interface RoomEventLoggerProps {
  onVideoReady:    () => void;
  onParticipantsChanged: () => void;
}

function RoomEventLogger({ onVideoReady, onParticipantsChanged }: RoomEventLoggerProps) {
  const room = useRoomContext();

  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let signalled = false;
    function signalReady(reason: string) {
      if (signalled) return;
      signalled = true;
      callLog.info('video ready', { reason });
      onVideoReady();
    }

    const onState = (state: ConnectionState) => {
      callLog.info('connection state', { state });
      if (state === ConnectionState.Connected && !signalled && !fallback) {
        fallback = setTimeout(() => signalReady('fallback-timeout'), VIDEO_READY_FALLBACK_MS);
      }
    };
    const onJoin  = (p: { identity: string; name?: string; sid: string }) => {
      callLog.info('participant connected', { identity: p.identity, name: p.name, sid: p.sid });
      onParticipantsChanged();
    };
    const onLeave = (p: { identity: string; sid: string }) => {
      callLog.info('participant disconnected', { identity: p.identity, sid: p.sid });
      onParticipantsChanged();
    };
    const onLocalPub = (pub: { kind: string; source?: string; track?: { mediaStreamTrack?: MediaStreamTrack } }) => {
      // Surface what the OS actually selected so we can spot mismatches with
      // the user's preferred device (e.g. NVIDIA Broadcast not loading and
      // the OS falling through to the raw webcam).
      let actualDeviceId: string | undefined;
      let actualLabel: string | undefined;
      try {
        const trackSettings = pub.track?.mediaStreamTrack?.getSettings?.();
        actualDeviceId = trackSettings?.deviceId;
        actualLabel    = pub.track?.mediaStreamTrack?.label;
      } catch { /* ignore */ }
      callLog.info('local track published', {
        kind:     pub.kind,
        source:   pub.source,
        deviceId: actualDeviceId,
        label:    actualLabel,
      });
      if (pub.source === Track.Source.Camera) signalReady('local-camera-published');
    };
    const onLocalUnpub = (pub: { kind: string; source?: string }) =>
      callLog.info('local track unpublished', { kind: pub.kind, source: pub.source });
    const onMediaErr = (err: unknown) => {
      callLog.error('media device failure', err);
      // If gUM failed (e.g. no camera available), nothing will ever publish —
      // unblock the connecting panel so the user isn't trapped behind it.
      signalReady('media-device-error');
    };
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
      if (fallback) clearTimeout(fallback);
      room.off(RoomEvent.ConnectionStateChanged,    onState);
      room.off(RoomEvent.ParticipantConnected,      onJoin);
      room.off(RoomEvent.ParticipantDisconnected,   onLeave);
      room.off(RoomEvent.LocalTrackPublished,       onLocalPub);
      room.off(RoomEvent.LocalTrackUnpublished,     onLocalUnpub);
      room.off(RoomEvent.MediaDevicesError,         onMediaErr);
      room.off(RoomEvent.Reconnecting,              onReconnecting);
      room.off(RoomEvent.Reconnected,               onReconnected);
    };
    // onVideoReady is intentionally excluded — it's stable on the parent
    // side and re-running this effect would detach all listeners mid-call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return null;
}

// ── MediaController ───────────────────────────────────────────────────────────

export type DeviceKind = 'mic' | 'cam' | 'speaker';

interface MediaControllerProps {
  micMuted: boolean;
  camMuted: boolean;
  screenSharing: boolean;
  preferredMicDeviceId: string;
  preferredCamDeviceId: string;
  preferredSpeakerDeviceId: string;
  displayName: string;
  avatarEmoji: string;
  /** Bumped by parent to request a re-application of the preferred devices. */
  retryNonce: number;
  onLocalShareEnded:   () => void;
  onRemoteShareChange: (sharing: boolean) => void;
  onShareError:        (msg: string) => void;
  onDeviceFallback:    (failures: DeviceKind[]) => void;
}

function MediaController({
  micMuted,
  camMuted,
  screenSharing,
  preferredMicDeviceId,
  preferredCamDeviceId,
  preferredSpeakerDeviceId,
  displayName,
  avatarEmoji,
  retryNonce,
  onLocalShareEnded,
  onRemoteShareChange,
  onShareError,
  onDeviceFallback,
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
      const failures: DeviceKind[] = [];
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();

        async function trySwitch(kind: DeviceKind, mediaKind: 'audioinput' | 'videoinput' | 'audiooutput', preferredId: string) {
          if (!preferredId) return;
          const ok = devices.some(d => d.kind === mediaKind && d.deviceId === preferredId);
          if (!ok) {
            deviceLog.warn(`preferred ${kind} not available`, { deviceId: preferredId });
            failures.push(kind);
            return;
          }
          try {
            await room.switchActiveDevice(mediaKind, preferredId);
            deviceLog.info(`switched ${kind}`, { deviceId: preferredId });
          } catch (err) {
            deviceLog.error(`switch ${kind} failed`, err);
            failures.push(kind);
          }
        }

        await trySwitch('mic',     'audioinput',  preferredMicDeviceId);
        await trySwitch('cam',     'videoinput',  preferredCamDeviceId);
        await trySwitch('speaker', 'audiooutput', preferredSpeakerDeviceId);
      } catch (err) {
        deviceLog.error('applyPreferredDevices failed', err);
      } finally {
        onDeviceFallback(failures);
      }
    }
    void applyPreferredDevices();
  }, [preferredMicDeviceId, preferredCamDeviceId, preferredSpeakerDeviceId, retryNonce, room, onDeviceFallback]);

  useEffect(() => {
    if (displayName) room.localParticipant.setName(displayName).catch(() => {});
  }, [displayName, room]);

  // Publish avatar emoji as participant metadata so remote clients + the
  // rooms-list endpoint can render it next to the user's name.
  //
  // setMetadata is a server-authenticated request and fails silently if
  // called before the room reaches Connected — so we gate on state and
  // re-publish on every connect (handles reconnections too). The log
  // confirms success/failure so we can tell from server-side uploaded logs
  // whether the metadata ever landed.
  useEffect(() => {
    function publish(why: string) {
      const meta = JSON.stringify({ avatarEmoji: avatarEmoji || '' });
      deviceLog.info('publishing participant metadata', { avatarEmoji, why });
      room.localParticipant.setMetadata(meta).then(() => {
        deviceLog.info('setMetadata succeeded');
      }).catch(err => {
        deviceLog.warn('setMetadata failed', err);
      });
    }

    if (room.state === ConnectionState.Connected) {
      publish('already-connected');
    }

    const onState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) publish('state-changed');
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);
    return () => { room.off(RoomEvent.ConnectionStateChanged, onState); };
  }, [avatarEmoji, room]);

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
