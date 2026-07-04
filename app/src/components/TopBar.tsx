// PreeceMeet top bar — comp 1b/1c chrome.
// Room icon + #name + live dot + mono timer + spacer + status/update pill,
// then right-side: fullscreen, chat toggle w/ unread dot, admin kebab, settings.
// Traffic-light left-inset on mac. Draggable region between the buttons.

import { useEffect, useState } from 'react';
import {
  BurgerIcon,
  GameModeIcon,
  FullscreenIcon,
  AdminIcon,
  ChatIcon,
  SettingsIcon,
  ConnQualityIcon,
} from './icons';
import WindowControls from './WindowControls';

type Quality = 'excellent' | 'good' | 'poor' | 'unknown';

interface Props {
  roomName:       string | null;
  inCall:         boolean;
  error:          string;
  updateVersion?: string;
  installing:     boolean;
  onInstallUpdate: () => void;

  onToggleSidebar: () => void;
  onEnterGameMode: () => void;
  onToggleFullscreen: () => void;
  isFullscreen:    boolean;

  isAdmin:         boolean;
  onOpenAdmin:     () => void;

  chatVisible:     boolean;
  chatUnread:      number;
  onToggleChat:    () => void;

  onOpenSettings:  () => void;

  showWinControls: boolean;
  callStartedAt:   number | null;
  connQuality:     Quality;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function CallTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tb-timer mono">{formatElapsed(now - startedAt)}</span>;
}

function qualityLabel(q: Quality): string {
  switch (q) {
    case 'excellent': return 'strong connection';
    case 'good':      return 'good connection';
    case 'poor':      return 'weak connection';
    default:          return '';
  }
}
function qualityClass(q: Quality): string {
  switch (q) {
    case 'excellent': return 'tb-quality good';
    case 'good':      return 'tb-quality good';
    case 'poor':      return 'tb-quality poor';
    default:          return 'tb-quality unknown';
  }
}

export default function TopBar({
  roomName, inCall, error,
  updateVersion, installing, onInstallUpdate,
  onToggleSidebar, onEnterGameMode, onToggleFullscreen, isFullscreen,
  isAdmin, onOpenAdmin,
  chatVisible, chatUnread, onToggleChat,
  onOpenSettings,
  showWinControls,
  callStartedAt, connQuality,
}: Props) {
  return (
    <div className="top-bar">
      <button className="tb-icon nodrag" onClick={onToggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">
        <BurgerIcon size={18} />
      </button>

      <div className="tb-room nodrag">
        <span className="tb-hash">#</span>
        <span className="tb-name">{roomName ?? 'no active call'}</span>
        {inCall && <span className="tb-live-dot" aria-hidden />}
        {inCall && callStartedAt && <CallTimer startedAt={callStartedAt} />}
      </div>

      {/* Draggable middle */}
      <div className="tb-drag" />

      {/* Status area — priority: error > update pill > connection quality */}
      {error ? (
        <span className="tb-error nodrag">{error}</span>
      ) : updateVersion ? (
        <button
          className="tb-update-pill nodrag"
          onClick={onInstallUpdate}
          disabled={installing}
          title={`Update to v${updateVersion}`}
        >
          {installing ? 'Installing…' : `↑ v${updateVersion}`}
        </button>
      ) : inCall && connQuality !== 'unknown' ? (
        <span className={qualityClass(connQuality) + ' nodrag'} title={qualityLabel(connQuality)}>
          <ConnQualityIcon size={17} />
        </span>
      ) : null}

      <button className="tb-icon nodrag" onClick={onEnterGameMode} title="Game mode" aria-label="Game mode">
        <GameModeIcon size={18} />
      </button>
      <button className={`tb-icon nodrag${isFullscreen ? ' active' : ''}`} onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)'} aria-label="Fullscreen">
        <FullscreenIcon exit={isFullscreen} size={18} />
      </button>
      {isAdmin && (
        <button className="tb-icon nodrag" onClick={onOpenAdmin} title="Admin panel" aria-label="Admin panel">
          <AdminIcon size={18} />
        </button>
      )}
      {inCall && (
        <button
          className={`tb-icon nodrag${chatVisible ? ' active' : ''}`}
          onClick={onToggleChat}
          title="Chat"
          aria-label="Toggle chat"
        >
          <ChatIcon size={18} />
          {chatUnread > 0 && !chatVisible && <span className="tb-unread" aria-hidden />}
        </button>
      )}
      <button className="tb-icon nodrag" onClick={onOpenSettings} title="Settings" aria-label="Settings">
        <SettingsIcon size={18} />
      </button>

      {showWinControls && <WindowControls />}
    </div>
  );
}
