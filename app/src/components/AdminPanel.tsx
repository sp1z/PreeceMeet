import { useState, useEffect, useCallback } from 'react';
import type { Session } from '../types';
import {
  adminGetUsers, adminCreateUser, adminDeleteUser,
  adminChangePassword, adminResetTotp, adminSetAdmin,
  UnauthorizedError, type AdminUser, type CreateUserResult,
} from '../api';

interface Props {
  session: Session;
  onClose: () => void;
  onSignOut: () => void;
}

export default function AdminPanel({ session, onClose, onSignOut }: Props) {
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [newEmail,    setNewEmail]    = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createResult, setCreateResult] = useState<CreateUserResult | null>(null);
  const [actionMsg,   setActionMsg]   = useState('');
  const [pwEmail,     setPwEmail]     = useState('');
  const [pwValue,     setPwValue]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await adminGetUsers(session.serverUrl, session.sessionToken);
      setUsers(list);
    } catch (e) {
      if (e instanceof UnauthorizedError) { onSignOut(); return; }
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [session, onSignOut]);

  useEffect(() => { void load(); }, [load]);

  async function createUser() {
    if (!newEmail.trim() || !newPassword.trim()) return;
    setCreating(true);
    setError('');
    setCreateResult(null);
    try {
      const result = await adminCreateUser(session.serverUrl, session.sessionToken, newEmail.trim(), newPassword);
      setCreateResult(result);
      setNewEmail('');
      setNewPassword('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setActionMsg('');
    try {
      await adminDeleteUser(session.serverUrl, session.sessionToken, email);
      setActionMsg(`Deleted ${email}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user.');
    }
  }

  async function resetTotp(email: string) {
    if (!confirm(`Reset TOTP for ${email}? They will re-enrol on next login.`)) return;
    setActionMsg('');
    try {
      await adminResetTotp(session.serverUrl, session.sessionToken, email);
      setActionMsg(`TOTP reset for ${email}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset TOTP.');
    }
  }

  async function changePassword() {
    if (!pwEmail || !pwValue.trim()) return;
    setActionMsg('');
    try {
      await adminChangePassword(session.serverUrl, session.sessionToken, pwEmail, pwValue);
      setActionMsg(`Password updated for ${pwEmail}.`);
      setPwEmail('');
      setPwValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password.');
    }
  }

  async function toggleAdmin(user: AdminUser) {
    setActionMsg('');
    try {
      await adminSetAdmin(session.serverUrl, session.sessionToken, user.email, !user.isAdmin);
      setActionMsg(`${user.email} is ${!user.isAdmin ? 'now' : 'no longer'} an admin.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update admin status.');
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 640, maxWidth: '90vw' }}>

        <div className="modal-header">
          <span>Admin Panel</span>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 14 }}>✕</button>
        </div>

        <div className="modal-body" style={{ gap: 16 }}>

          {error && <p style={{ color: '#ef5350', fontSize: 13 }}>{error}</p>}
          {actionMsg && <p style={{ color: '#23d18b', fontSize: 13 }}>{actionMsg}</p>}

          {/* ── Change password form (shown at top when active) ── */}
          {pwEmail && (
            <div style={{ background: 'rgba(91,155,213,0.1)', border: '1px solid var(--accent)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Change password for <strong style={{ color: 'var(--text-primary)' }}>{pwEmail}</strong></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="New password"
                  value={pwValue}
                  onChange={e => setPwValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void changePassword()}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button className="btn-primary" style={{ width: 'auto', margin: 0, padding: '8px 16px' }} onClick={() => void changePassword()}>
                  Set
                </button>
                <button className="btn-secondary" onClick={() => { setPwEmail(''); setPwValue(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── User list ─────────────────────────────── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Users {!loading && `(${users.length})`}
            </div>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                {users.map(u => (
                  <div key={u.email} className="admin-user-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </span>
                      {u.isAdmin && (
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(91,155,213,0.15)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          Admin
                        </span>
                      )}
                      {!u.totpConfigured && (
                        <span style={{ fontSize: 10, color: '#f4a21d', flexShrink: 0 }}>TOTP pending</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        className="admin-action-btn"
                        onClick={() => { setPwEmail(u.email); setPwValue(''); }}
                        title="Change password"
                      >pw</button>
                      <button
                        className="admin-action-btn"
                        onClick={() => void resetTotp(u.email)}
                        title="Reset TOTP"
                      >2FA</button>
                      <button
                        className={`admin-action-btn${u.isAdmin ? ' active' : ''}`}
                        onClick={() => void toggleAdmin(u)}
                        title={u.isAdmin ? 'Revoke admin' : 'Grant admin'}
                      >★</button>
                      <button
                        className="admin-action-btn danger"
                        onClick={() => void deleteUser(u.email)}
                        title="Delete user"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Create user ───────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Create user
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label>Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  onKeyDown={e => e.key === 'Enter' && void createUser()}
                />
              </div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label>Temporary password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Password"
                  onKeyDown={e => e.key === 'Enter' && void createUser()}
                />
              </div>
              <button
                className="btn-primary"
                style={{ width: 'auto', margin: 0, padding: '8px 16px' }}
                onClick={() => void createUser()}
                disabled={creating || !newEmail.trim() || !newPassword.trim()}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>

            {createResult && (
              <div style={{ marginTop: 12, background: 'var(--bg-main)', borderRadius: 8, padding: 12, fontSize: 12 }}>
                <div style={{ color: '#23d18b', marginBottom: 4 }}>User <strong>{createResult.email}</strong> created. Share the TOTP QR URI with them:</div>
                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--text-muted)', fontSize: 11 }}>{createResult.otpUri}</div>
              </div>
            )}
          </div>

        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>

      </div>
    </div>
  );
}
