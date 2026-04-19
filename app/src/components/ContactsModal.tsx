import { useEffect, useState } from 'react';
import type { Session } from '../types';
import { getUsers, ContactUser, UnauthorizedError } from '../api';
import { formatUser } from '../format';

interface Props {
  session:    Session;
  online:     Set<string>;
  inCall:     boolean;
  onCall:     (email: string) => Promise<{ ok: boolean; error?: string }>;
  onClose:    () => void;
  onSignOut:  () => void;
}

export default function ContactsModal({ session, online, inCall, onCall, onClose, onSignOut }: Props) {
  const [users, setUsers] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callingEmail, setCallingEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUsers(session.serverUrl, session.sessionToken)
      .then(list => { if (!cancelled) setUsers(list); })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) { onSignOut(); return; }
        setError(err instanceof Error ? err.message : 'Failed to load users');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, onSignOut]);

  // Merge live presence over the REST snapshot.
  const merged = users
    .map(u => ({ ...u, online: online.has(u.email.toLowerCase()) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.email.localeCompare(b.email));

  async function handleCall(email: string) {
    setCallingEmail(email);
    setError('');
    const result = await onCall(email);
    setCallingEmail('');
    if (!result.ok) setError(result.error || 'Call failed');
    else onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '90vw' }}>
        <div className="modal-header">
          <span>Contacts</span>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }} aria-label="Close">✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
          {error && <p style={{ color: '#ef5350' }}>{error}</p>}
          {!loading && merged.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>No other users registered yet.</p>
          )}
          {!loading && merged.map(u => {
            const label  = formatUser(u.email);
            const sub    = label !== u.email ? u.email : null;
            return (
              <div key={u.email} className="contact-row">
                <span className={`contact-dot${u.online ? ' online' : ''}`} />
                <div className="contact-identity">
                  <span className="contact-name">{label}</span>
                  {sub && <span className="contact-sub">{sub}</span>}
                </div>
                <span className={`contact-status${u.online ? ' online' : ''}`}>
                  {u.online ? 'online' : 'offline'}
                </span>
                <button
                  className="btn btn-primary contact-call-btn"
                  disabled={!u.online || inCall || callingEmail === u.email}
                  onClick={() => void handleCall(u.email)}
                  title={!u.online ? 'User offline' : inCall ? 'Already in a call' : 'Start direct call'}
                >
                  {callingEmail === u.email ? 'Calling…' : 'Call'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
