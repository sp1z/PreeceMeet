// Idle-state landing surface — comp 1a.
// Shown when the app is signed in but not in a call. This is the most-seen
// screen; orient the user, then let them jump into a channel or ring a user.

import { useEffect, useMemo, useState } from 'react';
import type { Channel, RoomInfo } from '../types';
import type { ContactUser } from '../api';
import { formatUser } from '../format';
import { PreeceMeetMark } from './Mark';

interface Props {
  channels:    Channel[];
  rooms:       RoomInfo[];
  users:       ContactUser[];
  online:      Set<string>;
  myEmail:     string;
  displayName: string;
  onJoin:      (channel: Channel) => void;
  onCall:      (email: string) => Promise<{ ok: boolean; error?: string }>;
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5)  return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(displayName: string, email: string): string {
  const src = (displayName || '').trim() || (email || '').split('@')[0] || 'there';
  return src.split(/[\s.]/)[0];
}

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
function formatStamp(d: Date): string {
  const day = DAYS[d.getDay()];
  const h12 = ((d.getHours() + 11) % 12) + 1;
  const m   = String(d.getMinutes()).padStart(2, '0');
  const ap  = d.getHours() < 12 ? 'AM' : 'PM';
  return `${day} · ${h12}:${m} ${ap}`;
}

export default function IdlePanel({
  channels, rooms, users, online, myEmail, displayName, onJoin, onCall,
}: Props) {
  const [now, setNow]   = useState(() => new Date());
  const [ringing, setRinging] = useState<string>('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const meLower = myEmail.toLowerCase();

  const roster = useMemo(() => users
    .filter(u => u.email.toLowerCase() !== meLower)
    .map(u => ({ ...u, online: online.has(u.email.toLowerCase()) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.email.localeCompare(b.email)),
    [users, online, meLower],
  );

  const rosterOnline = roster.filter(u => u.online);
  const cardsToShow  = roster.slice(0, 10);

  const roomsByName = useMemo(() => {
    const m = new Map<string, RoomInfo>();
    for (const r of rooms) m.set(r.name.toLowerCase(), r);
    return m;
  }, [rooms]);

  function liveCountFor(ch: Channel): number {
    return roomsByName.get(ch.name.toLowerCase())?.numParticipants ?? 0;
  }
  function participantsFor(ch: Channel) {
    const r = roomsByName.get(ch.name.toLowerCase());
    if (!r) return [] as { identity: string; name: string; avatarEmoji: string | null }[];
    return (r.participants
      ?? (r.participantNames ?? []).map(n => ({ identity: n, name: n, avatarEmoji: null as string | null })))
      .slice()
      .sort((a, b) => (a.identity || '').localeCompare(b.identity || ''));
  }

  const liveChannels = channels.filter(c => liveCountFor(c) > 0);
  const totalLive    = liveChannels.reduce((s, c) => s + liveCountFor(c), 0);

  async function handleCall(email: string) {
    setRinging(email);
    try { await onCall(email); }
    finally { setRinging(''); }
  }

  return (
    <div className="idle-panel">
      {/* Faint watermark */}
      <span className="idle-watermark" aria-hidden>
        <PreeceMeetMark size={520} variant="onDark" showDot={false} />
      </span>

      <div className="idle-inner">
        <div className="idle-stamp mono">{formatStamp(now)}</div>
        <h2 className="idle-greeting">{greeting(now)}, {firstName(displayName, myEmail)}</h2>
        <p className="idle-subline">
          {totalLive > 0
            ? <>{totalLive} {totalLive === 1 ? 'person' : 'people'} in {liveChannels.length} {liveChannels.length === 1 ? 'channel' : 'channels'} right now.</>
            : <>No calls in progress. {rosterOnline.length} {rosterOnline.length === 1 ? 'person is' : 'people are'} around.</>}
        </p>

        {cardsToShow.length > 0 && (
          <section className="idle-section">
            <div className="idle-label mono">AROUND NOW</div>
            <div className="idle-people">
              {cardsToShow.map(u => {
                const label = formatUser(u.email, u.displayName);
                const busy  = ringing === u.email;
                return (
                  <button
                    key={u.email}
                    type="button"
                    className={`idle-person${u.online ? '' : ' offline'}${busy ? ' busy' : ''}`}
                    onClick={() => { if (u.online && !busy) void handleCall(u.email); }}
                    disabled={!u.online || busy}
                    title={u.online ? `Call ${label}` : `${label} is offline`}
                  >
                    <span className="idle-person-avatar emoji">{u.avatarEmoji || '🙂'}</span>
                    <span className={`idle-person-dot${u.online ? ' online' : ''}`} />
                    <span className="idle-person-name">{u.displayName?.trim() || u.email.split('@')[0]}</span>
                    <span className="idle-person-sub mono">
                      {busy ? 'calling…' : u.online ? 'online' : 'offline'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {channels.length > 0 && (
          <section className="idle-section">
            <div className="idle-label mono">JUMP BACK IN</div>
            <div className="idle-channels">
              {channels.slice(0, 6).map(ch => {
                const count = liveCountFor(ch);
                const live  = count > 0;
                const people = participantsFor(ch).slice(0, 5);
                return (
                  <div key={ch.name} className={`idle-channel${live ? ' live' : ''}`}>
                    <div className="idle-channel-head">
                      <span className="idle-channel-emoji emoji">{ch.emoji || '💬'}</span>
                      <span className="idle-channel-name">#{ch.displayName?.trim() || ch.name}</span>
                      {live && (
                        <span className="idle-channel-pill mono" title={`${count} in call`}>
                          <span className="idle-channel-dot" />
                          LIVE · {count}
                        </span>
                      )}
                    </div>
                    <div className="idle-channel-status">
                      {live ? (
                        <div className="idle-channel-people">
                          {people.map(p => (
                            <span key={p.identity} className="idle-channel-person emoji" title={p.name}>
                              {p.avatarEmoji || '🙂'}
                            </span>
                          ))}
                          {count > people.length && (
                            <span className="idle-channel-more mono">+{count - people.length}</span>
                          )}
                        </div>
                      ) : (
                        <span className="idle-channel-empty mono">empty room</span>
                      )}
                      <button
                        type="button"
                        className={`idle-channel-join${live ? '' : ' ghost'}`}
                        onClick={() => onJoin(ch)}
                      >
                        {live ? 'Join' : 'Enter'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
