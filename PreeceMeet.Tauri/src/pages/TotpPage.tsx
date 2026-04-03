import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { TotpState, Session } from '../types';
import { saveSession } from '../settings';
import { verifyTotp } from '../api';

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
      const session: Session = {
        email:        '',   // we don't get email back from the API directly
        sessionToken: result.sessionToken,
        serverUrl,
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
              bgColor="#252638"
              fgColor="#e3e5e8"
              level="M"
            />
            {totpState.totpSecret && (
              <div className="secret-box">{totpState.totpSecret}</div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Authenticator code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="000 000"
              autoFocus={!isSetup}
              required
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading || code.replace(/\s/g, '').length < 6}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>
          <button type="button" className="btn-link" onClick={onBack}>← Back</button>
        </form>
      </div>
    </div>
  );
}
