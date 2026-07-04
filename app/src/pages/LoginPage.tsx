import { useState } from 'react';
import type { Settings, TotpState } from '../types';
import { saveSettings } from '../settings';
import { login } from '../api';
import { PreeceMeetMark, PreeceMeetWordmark } from '../components/Mark';
import { ChevronDownIcon } from '../components/icons';

interface Props {
  settings: Settings;
  onDone: (totp: TotpState) => void;
  onSettingsChange: (s: Settings) => void;
}

export default function LoginPage({ settings, onDone, onSettingsChange }: Props) {
  const [email,     setEmail]     = useState(settings.rememberMe ? settings.savedEmail : '');
  const [password,  setPassword]  = useState('');
  const [remember,  setRemember]  = useState(settings.rememberMe);
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [showAdv,   setShowAdv]   = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(serverUrl, email, password);
      const updated: Settings = {
        ...settings,
        serverUrl,
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
        <div className="auth-lockup">
          <span className="auth-mark-glow">
            <PreeceMeetMark size={80} showDot={false} />
          </span>
          <PreeceMeetWordmark size={26} onDark />
        </div>
        <h1>Sign in to continue</h1>
        <p className="subtitle">Welcome back.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="auth-meta-row">
            <label className="auth-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <button
              type="button"
              className="auth-forgot"
              onClick={() => {/* placeholder — password reset is admin-driven */}}
            >
              Forgot?
            </button>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-disclosure">
          <button
            type="button"
            className={`auth-disclosure-toggle${showAdv ? ' open' : ''}`}
            onClick={() => setShowAdv(v => !v)}
          >
            <span className="chev"><ChevronDownIcon size={14} /></span>
            Advanced · Server URL
          </button>
          {showAdv && (
            <div className="auth-disclosure-body">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="login-server">Server URL</label>
                <input
                  id="login-server"
                  type="url"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  placeholder="https://meet.russellpreece.com"
                />
              </div>
            </div>
          )}
        </div>

        <WebRtcDiagnostics />

        <div className="auth-footer">meet.russellpreece.com · v1.7.2</div>
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
    <div style={{ marginTop: 16, padding: 10, background: 'rgba(229,72,77,0.12)', border: '1px solid var(--pm-danger)', borderRadius: 10, fontSize: 11, color: 'var(--pm-danger-soft)', lineHeight: 1.5, textAlign: 'left' }}>
      <strong>WebRTC unavailable on this WebView.</strong> Calls won't connect.<br/>
      <span style={{ color: 'var(--pm-text-muted-3)' }}>Issues: {issues.join('; ')}</span><br/>
      <span style={{ color: 'var(--pm-text-muted-3)' }}>UA: {probe.ua.slice(0, 100)}</span>
    </div>
  );
}
