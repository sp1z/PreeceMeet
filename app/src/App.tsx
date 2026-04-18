import { useEffect, useState } from 'react';
import type { AppPage, TotpState, Session, Settings } from './types';
import { loadSession, loadSettings } from './settings';
import { getMe } from './api';
import { checkForUpdate } from './runtime';
import pkg from '../package.json';
import LoginPage from './pages/LoginPage';
import TotpPage from './pages/TotpPage';
import MainPage from './pages/MainPage';

export default function App() {
  const [page,          setPage]          = useState<AppPage>('login');
  const [totpState,     setTotpState]     = useState<TotpState | null>(null);
  const [session,       setSession]       = useState<Session | null>(null);
  const [settings,      setSettings]      = useState<Settings>(loadSettings);
  const [updateVersion, setUpdateVersion] = useState('');

  // Set the page title to match the running version (helpful for support).
  useEffect(() => { document.title = `PreeceMeet v${pkg.version}`; }, []);

  // Restore session (if any) and kick off a background update check.
  useEffect(() => {
    const s = loadSession();
    if (s) {
      const restored: Session = { ...s, isAdmin: s.isAdmin ?? false };
      setSession(restored);
      setPage('main');
      // Refresh isAdmin from server (grant/revoke takes effect without re-login).
      getMe(s.serverUrl, s.sessionToken)
        .then(me => setSession(prev => prev ? { ...prev, isAdmin: me.isAdmin } : prev))
        .catch(() => { /* ignore — stored value stands */ });
    }

    const t = setTimeout(async () => {
      const v = await checkForUpdate();
      if (v && v !== pkg.version) setUpdateVersion(v);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  function handleLoginDone(totp: TotpState) { setTotpState(totp); setPage('totp'); }
  function handleTotpDone(s: Session)       { setSession(s); setTotpState(null); setPage('main'); }
  function handleSignOut()                  { setSession(null); setPage('login'); }

  if (page === 'login') {
    return <LoginPage settings={settings} onDone={handleLoginDone} onSettingsChange={setSettings} />;
  }
  if (page === 'totp' && totpState) {
    return <TotpPage totpState={totpState} serverUrl={settings.serverUrl} onDone={handleTotpDone} onBack={() => setPage('login')} />;
  }
  if (page === 'main' && session) {
    return (
      <MainPage
        session={session}
        settings={settings}
        onSettingsChange={setSettings}
        onSignOut={handleSignOut}
        updateVersion={updateVersion}
      />
    );
  }
  return null;
}
