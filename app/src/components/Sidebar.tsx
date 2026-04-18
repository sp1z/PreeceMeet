import { useState, useEffect } from 'react';
import type { Channel, RoomInfo } from '../types';

interface Props {
  channels:        Channel[];
  rooms:           RoomInfo[];
  activeRoom:      string | null;
  email:           string;
  onJoin:          (channel: Channel) => void;
  onSettings:      () => void;
  onSignOut:       () => void;
  onAddChannel:    () => void;
  onDeleteChannel: (channelName: string) => void;
  visible:         boolean;
}

interface ChannelMenu { name: string; x: number; y: number; }

export default function Sidebar({ channels, rooms, activeRoom, email, onJoin, onSettings, onSignOut, onAddChannel, onDeleteChannel, visible }: Props) {
  const [footerMenuOpen, setFooterMenuOpen] = useState(false);
  const [channelMenu,    setChannelMenu]    = useState<ChannelMenu | null>(null);

  useEffect(() => {
    if (!channelMenu) return;
    const close = () => setChannelMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [channelMenu]);

  if (!visible) return null;

  function getRoomInfo(channelName: string): RoomInfo | undefined {
    return rooms.find(r => r.name.toLowerCase() === channelName.toLowerCase());
  }

  function participantSummary(room: RoomInfo | undefined): string {
    if (!room || room.numParticipants === 0) return '';
    if (room.participantNames.length === 0) return `${room.numParticipants} participant${room.numParticipants !== 1 ? 's' : ''}`;
    const names = room.participantNames.slice(0, 3).join(', ');
    const extra = room.numParticipants > 3 ? ` +${room.numParticipants - 3}` : '';
    return names + extra;
  }

  function handleChannelContextMenu(e: React.MouseEvent, name: string) {
    e.preventDefault();
    e.stopPropagation();
    setChannelMenu({ name, x: e.clientX, y: e.clientY });
  }

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <aside className="sidebar" style={{ position: 'relative' }}>
      <div className="sidebar-header">
        <span>PreeceMeet</span>
        <button className="icon-btn" onClick={onAddChannel} title="Add channel" style={{ width: 28, height: 28, fontSize: 20 }}>
          +
        </button>
      </div>

      <div className="sidebar-section-label">Channels</div>

      <div className="channel-list">
        {channels.length === 0 && (
          <div style={{ padding: '12px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
            No channels — click + to add one.
          </div>
        )}
        {channels.map(ch => {
          const room    = getRoomInfo(ch.name);
          const count   = room?.numParticipants ?? 0;
          const summary = participantSummary(room);
          const active  = ch.name === activeRoom;

          return (
            <div
              key={ch.name}
              className={`channel-row${active ? ' active' : ''}`}
              onClick={() => onJoin(ch)}
              onContextMenu={e => handleChannelContextMenu(e, ch.name)}
            >
              <div className="channel-emoji-wrap">{ch.emoji || '💬'}</div>
              <div className="channel-info">
                <div className="channel-name">{ch.displayName || ch.name}</div>
                {summary && <div className="channel-participants">{summary}</div>}
              </div>
              {count > 0 && <span className="participant-badge">{count}</span>}
            </div>
          );
        })}
      </div>

      {/* Channel context menu */}
      {channelMenu && (
        <div
          className="tile-context-menu"
          style={{ left: channelMenu.x, top: channelMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => { setChannelMenu(null); onSettings(); }}>
            ✏️ Edit channel
          </button>
          <button
            style={{ color: '#ef5350' }}
            onClick={() => {
              setChannelMenu(null);
              if (confirm(`Delete channel "${channelMenu.name}"?`)) onDeleteChannel(channelMenu.name);
            }}
          >
            🗑️ Delete channel
          </button>
        </div>
      )}

      {/* Footer popup menu */}
      {footerMenuOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setFooterMenuOpen(false)}
          />
          <div className="footer-menu">
            <button onClick={() => { setFooterMenuOpen(false); onSettings(); }}>
              <SettingsIcon /> Settings
            </button>
            <div className="separator" />
            <button className="sign-out" onClick={() => { setFooterMenuOpen(false); onSignOut(); }}>
              <SignOutIcon /> Sign Out
            </button>
          </div>
        </>
      )}

      <div className="sidebar-footer" onClick={() => setFooterMenuOpen(o => !o)}>
        <div className="avatar">{initial}</div>
        <span className="footer-email">{email || 'Account'}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </aside>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
