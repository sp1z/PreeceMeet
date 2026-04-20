import { useState, useEffect } from 'react';
import type { Channel, RoomInfo } from '../types';
import type { ContactUser } from '../api';
import { formatUser } from '../format';
import { PreeceMeetMark, PreeceMeetWordmark } from './Mark';

interface Props {
  channels:        Channel[];
  rooms:           RoomInfo[];
  activeRoom:      string | null;
  email:           string;
  displayName:     string;
  avatarEmoji:     string;
  users:           ContactUser[];
  online:          Set<string>;
  inCall:          boolean;
  onCall:          (email: string) => Promise<{ ok: boolean; error?: string }>;
  onJoin:          (channel: Channel) => void;
  onSettings:      () => void;
  onSignOut:       () => void;
  onAddChannel:    () => void;
  onDeleteChannel: (channelName: string) => void;
  visible:         boolean;
}

interface ChannelMenu { name: string; x: number; y: number; }

export default function Sidebar({ channels, rooms, activeRoom, email, displayName, avatarEmoji, users, online, inCall, onCall, onJoin, onSettings, onSignOut, onAddChannel, onDeleteChannel, visible }: Props) {
  const [callingEmail, setCallingEmail] = useState('');
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

  function handleChannelContextMenu(e: React.MouseEvent, name: string) {
    e.preventDefault();
    e.stopPropagation();
    setChannelMenu({ name, x: e.clientX, y: e.clientY });
  }

  // Prefer display name; fall back to email; only show "?" if we truly have
  // nothing (shouldn't happen once session.email is populated).
  const footerLabel = displayName?.trim() || email || 'Account';

  // Build the user roster: exclude ourselves, layer live presence on top of
  // the REST snapshot, and sort online-first.
  const myEmail = email.toLowerCase();
  const roster = users
    .filter(u => u.email.toLowerCase() !== myEmail)
    .map(u => ({ ...u, online: online.has(u.email.toLowerCase()) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.email.localeCompare(b.email));

  async function handleCall(userEmail: string) {
    setCallingEmail(userEmail);
    try { await onCall(userEmail); }
    finally { setCallingEmail(''); }
  }

  return (
    <aside className="sidebar" style={{ position: 'relative' }}>
      <div className="sidebar-header">
        <div className="sidebar-lockup">
          <PreeceMeetMark size={26} tileRadius={46} />
          <PreeceMeetWordmark size={18} onDark />
        </div>
        <button className="icon-btn" onClick={onAddChannel} title="Add channel" style={{ width: 28, height: 28, fontSize: 20 }}>
          +
        </button>
      </div>

      <div className="sidebar-section-label">Users</div>
      <div className="user-list">
        {roster.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
            No other users yet.
          </div>
        )}
        {roster.map(u => {
          const label = formatUser(u.email);
          const busy  = callingEmail === u.email;
          const disabled = !u.online || inCall || busy;
          const title = !u.online ? 'User offline' : inCall ? 'Already in a call' : `Call ${label}`;
          return (
            <button
              key={u.email}
              type="button"
              className={`user-row${u.online ? ' online' : ''}${disabled ? ' disabled' : ''}`}
              onClick={() => { if (!disabled) void handleCall(u.email); }}
              disabled={disabled}
              title={title}
            >
              <span className={`user-dot${u.online ? ' online' : ''}`} />
              <span className="user-name">{label}</span>
              {busy && <span className="user-calling">calling…</span>}
            </button>
          );
        })}
      </div>

      <div className="sidebar-section-label">Channels</div>

      <div className="channel-list">
        {channels.length === 0 && (
          <div style={{ padding: '12px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
            No channels — click + to add one.
          </div>
        )}
        {channels.map(ch => {
          const room   = getRoomInfo(ch.name);
          const count  = room?.numParticipants ?? 0;
          // Prefer the structured participants list (has avatarEmoji); fall
          // back to the legacy participantNames[] for older server replies.
          // LiveKit returns participants in unstable order — sort by identity
          // so the sidebar doesn't reshuffle on every poll.
          const people = (room?.participants
            ?? (room?.participantNames ?? []).map(n => ({ identity: n, name: n, avatarEmoji: null as string | null })))
            .slice()
            .sort((a, b) => (a.identity || '').localeCompare(b.identity || ''));
          const active = ch.name === activeRoom;

          return (
            <div key={ch.name} className="channel-block">
              <div
                className={`channel-row${active ? ' active' : ''}`}
                onClick={() => onJoin(ch)}
                onContextMenu={e => handleChannelContextMenu(e, ch.name)}
              >
                <div className="channel-emoji-wrap emoji">{ch.emoji || '💬'}</div>
                <div className="channel-info">
                  <div className="channel-name">
                    {ch.displayName || ch.name}
                    {count > 0 && <span className="live-indicator" title="Call in progress" />}
                  </div>
                </div>
                {count > 0 && <span className="participant-badge mono">{count}</span>}
              </div>
              {people.length > 0 && (
                <div className="participant-list">
                  {people.map(p => (
                    <div key={p.identity} className="participant-row" title={p.name}>
                      {p.avatarEmoji
                        ? <span className="participant-avatar emoji">{p.avatarEmoji}</span>
                        : <span className="participant-dot" />}
                      <span className="participant-name">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
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
        <div className="avatar emoji">{avatarEmoji || '🙂'}</div>
        <div className="footer-identity">
          <span className="footer-name">{footerLabel}</span>
          {displayName && email && displayName !== email && (
            <span className="footer-sub">{email}</span>
          )}
        </div>
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
