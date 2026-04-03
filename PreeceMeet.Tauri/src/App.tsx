import { useState, useEffect } from 'react';
import type { AppPage, TotpState, Session, Settings } from './types';
import { loadSession, loadSettings } from './settings';
import LoginPage from './pages/LoginPage';
import TotpPage from './pages/TotpPage';
import MainPage from './pages/MainPage';

export default function App() {
  const [page, setPage]           = useState<AppPage>('login');
  const [totpState, setTotpState] = useState<TotpState | null>(null);
  const [session, setSession]     = useState<Session | null>(null);
  const [settings, setSettings]   = useState<Settings>(loadSettings);

  // Restore session on mount
  useEffect(() => {
    const s = loadSession();
    if (s) { setSession(s); setPage('main'); }
  }, []);

  function handleLoginDone(totp: TotpState) {
    setTotpState(totp);
    setPage('totp');
  }

  function handleTotpDone(s: Session) {
    setSession(s);
    setTotpState(null);
    setPage('main');
  }

  function handleSignOut() {
    setSession(null);
    setPage('login');
  }

  if (page === 'login') {
    return (
      <LoginPage
        settings={settings}
        onDone={handleLoginDone}
        onSettingsChange={setSettings}
      />
    );
  }

  if (page === 'totp' && totpState) {
    return (
      <TotpPage
        totpState={totpState}
        serverUrl={settings.serverUrl}
        onDone={handleTotpDone}
        onBack={() => setPage('login')}
      />
    );
  }

  if (page === 'main' && session) {
    return (
      <MainPage
        session={session}
        settings={settings}
        onSettingsChange={setSettings}
        onSignOut={handleSignOut}
      />
    );
  }

  return null;
}
