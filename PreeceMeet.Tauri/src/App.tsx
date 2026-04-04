import { useState, useEffect } from 'react';
import type { AppPage, TotpState, Session, Settings } from './types';
import { loadSession, loadSettings } from './settings';
import { getMe } from './api';
import pkg from '../package.json';
import LoginPage from './pages/LoginPage';
import TotpPage from './pages/TotpPage';
import MainPage from './pages/MainPage';

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

  // Set window title with version (matches WPF "PreeceMeet v0.x.x" title)
  useEffect(() => {
    const title = `PreeceMeet v${pkg.version}`;
    document.title = title;
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => void getCurrentWindow().setTitle(title))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const s = loadSession();
    if (s) {
      const restored: Session = { ...s, isAdmin: s.isAdmin ?? false };
      setSession(restored);
      setPage('main');
      // Refresh isAdmin from server (grant/revoke takes effect without re-login).
      getMe(s.serverUrl, s.sessionToken)
        .then(me => setSession(prev => prev ? { ...prev, isAdmin: me.isAdmin } : prev))
        .catch(() => { /* ignore — keep stored value */ });
    }
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
