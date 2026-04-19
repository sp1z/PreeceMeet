import { useEffect, useState } from 'react';
import type { AppPage, TotpState, Session, Settings } from './types';
import { loadSession, loadSettings } from './settings';
import { getMe } from './api';
import { checkForUpdate } from './runtime';
import pkg from '../package.json';
import LoginPage from './pages/LoginPage';
import TotpPage from './pages/TotpPage';
import MainPage from './pages/MainPage';
import Splash from './components/Splash';

// Short-circuit the full 2.4s splash after the user has launched the app
// once, so warm launches don't feel slow. The flag is stored per-install
// and there's no UI to reset it — it's purely an ergonomic shortcut.
const SEEN_SPLASH_KEY = 'preecemeet_seen_splash';

export default function App() {
  const [page,          setPage]          = useState<AppPage>('login');
  const [totpState,     setTotpState]     = useState<TotpState | null>(null);
  const [session,       setSession]       = useState<Session | null>(null);
  const [settings,      setSettings]      = useState<Settings>(loadSettings);
  const [updateVersion, setUpdateVersion] = useState('');
  const [splashDone,    setSplashDone]    = useState(false);

  const firstLaunch = !localStorage.getItem(SEEN_SPLASH_KEY);

  // Set the page title to match the running version (helpful for support).
  useEffect(() => { document.title = `PreeceMeet v${pkg.version}`; }, []);

  function handleSplashDone() {
    localStorage.setItem(SEEN_SPLASH_KEY, '1');
    setSplashDone(true);
  }

  // Restore session (if any) and kick off a background update check.
  useEffect(() => {
    const s = loadSession();
    if (s) {
      const restored: Session = { ...s, isAdmin: s.isAdmin ?? false };
      setSession(restored);
      setPage('main');
      // Refresh isAdmin + email from server so grant/revoke and identity stay
      // in sync without forcing a re-login. Older saved sessions have no email.
      getMe(s.serverUrl, s.sessionToken)
        .then(me => setSession(prev => prev ? { ...prev, isAdmin: me.isAdmin, email: me.email || prev.email } : prev))
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

  // Render the page underneath the splash so the fade-out reveals real
  // content. Until the splash has dismissed itself, inputs underneath are
  // inert because the splash covers them (pointer-events: none after fade).
  let content: React.ReactNode = null;
  if (page === 'login') {
    content = <LoginPage settings={settings} onDone={handleLoginDone} onSettingsChange={setSettings} />;
  } else if (page === 'totp' && totpState) {
    content = <TotpPage totpState={totpState} serverUrl={settings.serverUrl} onDone={handleTotpDone} onBack={() => setPage('login')} />;
  } else if (page === 'main' && session) {
    content = (
      <MainPage
        session={session}
        settings={settings}
        onSettingsChange={setSettings}
        onSignOut={handleSignOut}
        updateVersion={updateVersion}
      />
    );
  }

  return (
    <>
      {content}
      {!splashDone && <Splash quick={!firstLaunch} onDone={handleSplashDone} />}
    </>
  );
}
