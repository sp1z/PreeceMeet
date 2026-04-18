import { useState } from 'react';
import type { Settings, TotpState } from '../types';
import { saveSettings } from '../settings';
import { login } from '../api';

interface Props {
  settings: Settings;
  onDone: (totp: TotpState) => void;
  onSettingsChange: (s: Settings) => void;
}

export default function LoginPage({ settings, onDone, onSettingsChange }: Props) {
  const [email,    setEmail]    = useState(settings.rememberMe ? settings.savedEmail : '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(settings.rememberMe);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(settings.serverUrl, email, password);
      const updated: Settings = {
        ...settings,
        savedEmail: remember ? email : '',
        rememberMe: remember,
      };
      onSettingsChange(updated);
      saveSettings(updated);
      onDone({
        tempToken:   result.tempToken,
        otpUri:      result.otpUri,
        totpSecret:  result.totpSecret,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign in</h1>
        <p className="subtitle">Enter your PreeceMeet credentials</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="remember"
              style={{ width: 'auto' }}
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
            />
            <label htmlFor="remember" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-primary)', fontSize: 13 }}>
              Remember email
            </label>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>
        <WebRtcDiagnostics />
      </div>
    </div>
  );
}

function WebRtcDiagnostics() {
  const probe = (() => {
    const hasPC  = typeof RTCPeerConnection !== 'undefined';
    const hasTrx = hasPC && 'addTransceiver' in RTCPeerConnection.prototype;
    const hasAdd = hasPC && 'addTrack' in RTCPeerConnection.prototype;
    const hasGUM = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const supported = hasPC && (hasTrx || hasAdd);
    return { hasPC, hasTrx, hasAdd, hasGUM, supported, ua: navigator.userAgent };
  })();

  if (probe.supported && probe.hasGUM) return null;

  const issues: string[] = [];
  if (!probe.hasPC)  issues.push('RTCPeerConnection missing');
  if (probe.hasPC && !probe.hasTrx && !probe.hasAdd) issues.push('addTransceiver/addTrack missing');
  if (!probe.hasGUM) issues.push('navigator.mediaDevices.getUserMedia missing');

  return (
    <div style={{ marginTop: 16, padding: 10, background: 'rgba(239,83,80,0.12)', border: '1px solid #ef5350', borderRadius: 6, fontSize: 11, color: '#ef5350', lineHeight: 1.5 }}>
      <strong>WebRTC unavailable on this WebView.</strong> Calls won't connect.<br/>
      <span style={{ color: 'var(--text-muted)' }}>Issues: {issues.join('; ')}</span><br/>
      <span style={{ color: 'var(--text-muted)' }}>UA: {probe.ua.slice(0, 100)}</span>
    </div>
  );
}
