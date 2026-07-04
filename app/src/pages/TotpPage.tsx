import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { TotpState, Session } from '../types';
import { saveSession } from '../settings';
import { getMe, verifyTotp } from '../api';
import { PreeceMeetMark, PreeceMeetWordmark } from '../components/Mark';

interface Props {
  totpState: TotpState;
  serverUrl: string;
  onDone: (session: Session) => void;
  onBack: () => void;
}

export default function TotpPage({ totpState, serverUrl, onDone, onBack }: Props) {
  const [code,    setCode]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const isSetup = !!totpState.otpUri;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await verifyTotp(serverUrl, totpState.tempToken, code.replace(/\s/g, ''));
      // verifyTotp doesn't return the email; fetch it from /api/auth/me so the
      // session carries the signed-in identity (used in sidebar, logs, etc.).
      let email = '';
      try {
        const me = await getMe(serverUrl, result.sessionToken);
        email = me.email;
      } catch { /* fall back to empty — user can still call, just shows blank */ }
      const session: Session = {
        email,
        sessionToken: result.sessionToken,
        serverUrl,
        isAdmin:      result.isAdmin ?? false,
      };
      saveSession(session);
      onDone(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setCode('');
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
        <h1>{isSetup ? 'Set up authenticator' : 'Two-factor authentication'}</h1>
        <p className="subtitle">
          {isSetup
            ? 'Scan the QR code with your authenticator app, then enter the 6-digit code.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>

        {isSetup && totpState.otpUri && (
          <div className="qr-wrap">
            <QRCodeSVG
              value={totpState.otpUri}
              size={180}
              bgColor="#0B1230"
              fgColor="#E9EDF8"
              level="M"
            />
            {totpState.totpSecret && (
              <div className="secret-box">{totpState.totpSecret}</div>
            )}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="totp-code">Authenticator code</label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="000 000"
              autoFocus={!isSetup}
              required
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, fontFamily: 'var(--font-mono)' }}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading || code.replace(/\s/g, '').length < 6}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Verifying…' : 'Verify'}
          </button>
          <button type="button" className="btn-link" onClick={onBack}>← Back</button>
        </form>

        <div className="auth-footer">meet.russellpreece.com · v1.7.2</div>
      </div>
    </div>
  );
}
