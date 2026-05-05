import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StatusBar, StyleSheet } from 'react-native';
import { registerGlobals } from '@livekit/react-native';

import { theme } from './src/theme';
import { loadSession, saveSession, clearSession, type Session } from './src/session';
import { useDirectCalling } from './src/calling';
import { setSessionForLogs } from './src/errorReporter';
import { ErrorBoundary } from './src/errorBoundary';
import LoginScreen from './src/screens/LoginScreen';
import TotpScreen from './src/screens/TotpScreen';
import HomeScreen from './src/screens/HomeScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import CallScreen from './src/screens/CallScreen';
import { IncomingCallModal, OutgoingCallModal } from './src/components/IncomingCallModal';
import type { LoginResult } from './src/api';

// One-time WebRTC global registration — required by @livekit/react-native.
registerGlobals();

type Page = 'loading' | 'login' | 'totp' | 'home' | 'contacts' | 'call';

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

  // When a direct call is accepted (either side), drop into the LiveKit room.
  useEffect(() => {
    return calling.onAccepted(({ roomName, livekitToken, livekitUrl }) => {
      setActiveCall({ url: livekitUrl, token: livekitToken, roomName });
      setPage('call');
    });
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
          onJoinChannel={joinChannel}
          onOpenContacts={() => setPage('contacts')}
          onSignOut={onSignOut}
        />
      )}

      {page === 'contacts' && (
        <ContactsScreen
          session={session}
          online={calling.online}
          inCall={!!activeCall}
          onCall={calling.call}
          onClose={() => setPage('home')}
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
