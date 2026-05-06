import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StatusBar, StyleSheet } from 'react-native';
import { registerGlobals } from '@livekit/react-native';

import { theme } from './src/theme';
import { loadSession, saveSession, clearSession, type Session } from './src/session';
import { useDirectCalling } from './src/calling';
import { setSessionForLogs, reportError } from './src/errorReporter';
import { ErrorBoundary } from './src/errorBoundary';
import { registerForPushNotifications } from './src/notifications';
import { registerDevice } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import TotpScreen from './src/screens/TotpScreen';
import HomeScreen from './src/screens/HomeScreen';
import CallScreen from './src/screens/CallScreen';
import { IncomingCallModal, OutgoingCallModal } from './src/components/IncomingCallModal';
import type { LoginResult } from './src/api';

// One-time WebRTC global registration — required by @livekit/react-native.
registerGlobals();

type Page = 'loading' | 'login' | 'totp' | 'home' | 'call';

interface PendingTotp {
  serverUrl:  string;
  email:      string;
  tempToken:  string;
  totpSetup?: boolean;
  totpSecret?: string;
  otpUri?:    string;
}

interface ActiveCall {
  url:      string;
  token:    string;
  roomName: string;
}

export default function App() {
  const [page,        setPage]        = useState<Page>('loading');
  const [session,     setSession]     = useState<Session | null>(null);
  const [pendingTotp, setPendingTotp] = useState<PendingTotp | null>(null);
  const [activeCall,  setActiveCall]  = useState<ActiveCall | null>(null);

  useEffect(() => {
    loadSession().then(s => {
      if (s) { setSession(s); setPage('home'); }
      else   { setPage('login'); }
    });
  }, []);

  useEffect(() => {
    setSessionForLogs(session ? { serverUrl: session.serverUrl, sessionToken: session.sessionToken } : null);
  }, [session]);

  // Register for APNs push and post the token to the server so /hubs/call can
  // wake the device when someone direct-calls us. Best-effort — failure here
  // shouldn't block sign-in.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const reg = await registerForPushNotifications();
      if (!reg || cancelled) return;
      const ok = await registerDevice(session.serverUrl, session.sessionToken, reg.token, reg.platform);
      if (!ok) reportError('device push registration failed');
    })().catch(e => reportError('push setup threw', e));
    return () => { cancelled = true; };
  }, [session]);

  function handleLoginDone(serverUrl: string, email: string, result: LoginResult) {
    setPendingTotp({
      serverUrl, email,
      tempToken:  result.tempToken,
      totpSetup:  result.totpSetup,
      totpSecret: result.totpSecret,
      otpUri:     result.otpUri,
    });
    setPage('totp');
  }

  async function handleVerified(s: Session) {
    await saveSession(s);
    setSession(s);
    setPendingTotp(null);
    setPage('home');
  }

  async function handleSignOut() {
    await clearSession();
    setSession(null);
    setActiveCall(null);
    setPage('login');
  }

  function joinChannel(roomName: string, livekitUrl: string, livekitToken: string) {
    setActiveCall({ url: livekitUrl, token: livekitToken, roomName });
    setPage('call');
  }

  if (page === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (page === 'login') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        <LoginScreen onLoginDone={handleLoginDone} />
      </>
    );
  }

  if (page === 'totp' && pendingTotp) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        <TotpScreen
          serverUrl={pendingTotp.serverUrl}
          email={pendingTotp.email}
          tempToken={pendingTotp.tempToken}
          totpSetup={pendingTotp.totpSetup}
          totpSecret={pendingTotp.totpSecret}
          otpUri={pendingTotp.otpUri}
          onVerified={handleVerified}
          onBack={() => { setPendingTotp(null); setPage('login'); }}
        />
      </>
    );
  }

  if (session) {
    return (
      <SignedIn
        session={session}
        page={page}
        setPage={setPage}
        activeCall={activeCall}
        setActiveCall={setActiveCall}
        joinChannel={joinChannel}
        onSignOut={handleSignOut}
      />
    );
  }

  return null;
}

interface SignedInProps {
  session:       Session;
  page:          Page;
  setPage:       (p: Page) => void;
  activeCall:    ActiveCall | null;
  setActiveCall: (c: ActiveCall | null) => void;
  joinChannel:   (roomName: string, url: string, token: string) => void;
  onSignOut:     () => void;
}

function SignedIn({ session, page, setPage, activeCall, setActiveCall, joinChannel, onSignOut }: SignedInProps) {
  const calling = useDirectCalling(session);

  // Drop into the LiveKit room when a direct call is accepted (either side).
  // Reads `calling.accepted` (plain React state) instead of subscribing via a
  // callback — going through React's batching means the setActiveCall+setPage
  // update lands in the same commit as the SignalR-triggered state changes,
  // so CallScreen mounts and commits normally instead of rendering-without-
  // committing the way it did with the ref-callback path.
  useEffect(() => {
    if (!calling.accepted) return;
    const { roomName, livekitToken, livekitUrl } = calling.accepted;
    setActiveCall({ url: livekitUrl, token: livekitToken, roomName });
    setPage('call');
    calling.consumeAccepted();
  }, [calling, setActiveCall, setPage]);

  function leaveCall() {
    setActiveCall(null);
    setPage('home');
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

      {page === 'home' && (
        <HomeScreen
          session={session}
          online={calling.online}
          inCall={!!activeCall}
          onJoinChannel={joinChannel}
          onCall={calling.call}
          onSignOut={onSignOut}
        />
      )}

      {page === 'call' && activeCall && (
        <ErrorBoundary label="CallScreen" onReset={leaveCall}>
          <CallScreen
            url={activeCall.url}
            token={activeCall.token}
            roomName={activeCall.roomName}
            onLeave={leaveCall}
          />
        </ErrorBoundary>
      )}

      {calling.incoming && (
        <IncomingCallModal
          call={calling.incoming}
          onAccept={() => void calling.accept()}
          onDecline={() => void calling.decline()}
        />
      )}

      {calling.outgoing && (
        <OutgoingCallModal
          call={calling.outgoing}
          onCancel={() => void calling.cancel()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' },
});
