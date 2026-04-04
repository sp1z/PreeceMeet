import { useState, useEffect } from 'react';
import type { AppPage, TotpState, Session, Settings } from './types';
import { loadSession, loadSettings } from './settings';
import LoginPage from './pages/LoginPage';
import TotpPage from './pages/TotpPage';
import MainPage from './pages/MainPage';

// Tauri updater — only available in the native app build, not web.
async function checkForUpdates(setUpdateAvailable: (v: string) => void) {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available && update.version) {
      setUpdateAvailable(update.version);
    }
  } catch { /* not in Tauri context, or network error — ignore */ }
}

export default function App() {
  const [page, setPage]                   = useState<AppPage>('login');
  const [totpState, setTotpState]         = useState<TotpState | null>(null);
  const [session, setSession]             = useState<Session | null>(null);
  const [settings, setSettings]           = useState<Settings>(loadSettings);
  const [updateVersion, setUpdateVersion] = useState('');

  // Restore session on mount; check for updates after a short delay.
  useEffect(() => {
    const s = loadSession();
    if (s) { setSession(s); setPage('main'); }
    setTimeout(() => void checkForUpdates(setUpdateVersion), 5000);
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
        updateVersion={updateVersion}
      />
    );
  }

  return null;
}
