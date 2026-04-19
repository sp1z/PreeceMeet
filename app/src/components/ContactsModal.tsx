import { useEffect, useState } from 'react';
import type { Session } from '../types';
import { getUsers, ContactUser, UnauthorizedError } from '../api';

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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '90vw' }}>
        <div className="modal-header">
          <h2>Contacts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
          {error && <p style={{ color: '#ef5350' }}>{error}</p>}
          {!loading && merged.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>No other users registered yet.</p>
          )}
          {!loading && merged.map(u => (
            <div key={u.email} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 4px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: u.online ? '#34d399' : 'var(--border)',
                flexShrink: 0,
              }} />
              <span style={{ flex: 1, fontSize: 14 }}>{u.email}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 50 }}>
                {u.online ? 'online' : 'offline'}
              </span>
              <button
                className="btn btn-primary"
                disabled={!u.online || inCall || callingEmail === u.email}
                onClick={() => void handleCall(u.email)}
                style={{ padding: '4px 12px', fontSize: 12 }}
                title={!u.online ? 'User offline' : inCall ? 'Already in a call' : 'Start direct call'}
              >
                {callingEmail === u.email ? 'Calling…' : 'Call'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
