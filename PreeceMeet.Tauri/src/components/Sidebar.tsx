import { useState } from 'react';
import type { Channel, RoomInfo } from '../types';

interface Props {
  channels: Channel[];
  rooms: RoomInfo[];
  activeRoom: string | null;
  email: string;
  onJoin: (channel: Channel) => void;
  onSignOut: () => void;
  visible: boolean;
}

export default function Sidebar({ channels, rooms, activeRoom, email, onJoin, onSignOut, visible }: Props) {
  const [footerMenuOpen, setFooterMenuOpen] = useState(false);

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

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <aside className="sidebar" style={{ position: 'relative' }}>
      <div className="sidebar-header">
        <span>PreeceMeet</span>
        <button className="icon-btn" style={{ fontSize: 16 }} title="Add channel">＋</button>
      </div>

      <div className="sidebar-section-label">Channels</div>

      <div className="channel-list">
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

      {/* Footer menu popup */}
      {footerMenuOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setFooterMenuOpen(false)}
          />
          <div className="footer-menu">
            <button onClick={() => setFooterMenuOpen(false)}>⚙ Settings</button>
            <div className="separator" />
            <button className="sign-out" onClick={() => { setFooterMenuOpen(false); onSignOut(); }}>
              ⏏ Sign Out
            </button>
          </div>
        </>
      )}

      <div className="sidebar-footer" onClick={() => setFooterMenuOpen(o => !o)}>
        <div className="avatar">{initial}</div>
        <span className="footer-email">{email || 'Account'}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>▲</span>
      </div>
    </aside>
  );
}
