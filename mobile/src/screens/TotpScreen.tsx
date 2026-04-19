import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { theme } from '../theme';
import { verifyTotp } from '../api';
import type { Session } from '../session';

interface Props {
  serverUrl: string;
  email:     string;
  tempToken: string;
  totpSetup?: boolean;
  totpSecret?: string;
  otpUri?:    string;
  onVerified: (session: Session) => void;
  onBack:     () => void;
}

export default function TotpScreen({ serverUrl, email, tempToken, totpSetup, totpSecret, otpUri, onVerified, onBack }: Props) {
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function submit() {
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true); setError('');
    try {
      const result = await verifyTotp(serverUrl, tempToken, code);
      onVerified({ email, sessionToken: result.sessionToken, serverUrl, isAdmin: result.isAdmin });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally { setLoading(false); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Two-factor</Text>
        <Text style={styles.subtitle}>{email}</Text>

        {totpSetup && (
          <View style={styles.setupBox}>
            <Text style={styles.setupTitle}>First-time setup</Text>
            <Text style={styles.setupBody}>
              Add this account to your authenticator app, then enter the code it shows.
            </Text>
            {otpUri && <Text style={styles.uri} selectable>{otpUri}</Text>}
            {totpSecret && (
              <Text style={styles.secret} selectable>Secret: {totpSecret}</Text>
            )}
          </View>
        )}

        <Text style={styles.label}>6-digit code</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: 20 },
  card:       { backgroundColor: theme.bgPanel, borderRadius: 12, padding: 24, borderWidth: 1, borderColor: theme.border },
  title:      { color: theme.text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle:   { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20 },
  label:      { color: theme.textMuted, fontSize: 12, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { backgroundColor: theme.bgInput, color: theme.text, borderRadius: 6, padding: 12, fontSize: 22, borderWidth: 1, borderColor: theme.border, textAlign: 'center', letterSpacing: 8 },
  error:      { color: theme.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
  button:     { backgroundColor: theme.primary, padding: 14, borderRadius: 6, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  back:       { color: theme.textMuted, marginTop: 16, textAlign: 'center', fontSize: 13 },
  setupBox:   { backgroundColor: theme.bgInput, borderRadius: 6, padding: 12, marginBottom: 8 },
  setupTitle: { color: theme.text, fontWeight: '600', marginBottom: 4 },
  setupBody:  { color: theme.textMuted, fontSize: 12 },
  uri:        { color: theme.text, fontSize: 11, marginTop: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  secret:     { color: theme.text, fontSize: 12, marginTop: 4, fontWeight: '600' },
});
