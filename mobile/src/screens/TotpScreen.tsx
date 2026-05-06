import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { theme } from '../theme';
import { verifyTotp } from '../api';
import type { Session } from '../session';

interface Props {
  serverUrl:  string;
  email:      string;
  tempToken:  string;
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Two-factor</Text>
          <Text style={styles.subtitle}>{email}</Text>

          {totpSetup && (
            <View style={styles.setupBox}>
              <Text style={styles.setupTitle}>First-time setup</Text>
              <Text style={styles.setupBody}>
                Add this account to an authenticator app (1Password, Authy, etc.) using one of the methods below, then enter the code it shows.
              </Text>

              {otpUri && <CopyField label="Auth URI" value={otpUri} mono />}
              {totpSecret && <CopyField label="Secret" value={totpSecret} mono spacing />}
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
            autoFocus={!totpSetup}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CopyField({ label, value, mono, spacing }: { label: string; value: string; mono?: boolean; spacing?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <View style={[styles.copyBlock, spacing && { marginTop: 14 }]}>
      <Text style={styles.copyLabel}>{label}</Text>
      <TextInput
        value={value}
        editable={false}
        multiline
        scrollEnabled={false}
        selectTextOnFocus
        style={[styles.copyInput, mono && styles.copyInputMono]}
      />
      <TouchableOpacity style={styles.copyBtn} onPress={copy}>
        <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: theme.bg },
  scroll:     { flexGrow: 1, justifyContent: 'flex-start', padding: 20, paddingTop: 60 },
  card:       { backgroundColor: theme.bgPanel, borderRadius: 12, padding: 24, borderWidth: 1, borderColor: theme.border },
  title:      { color: theme.text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle:   { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20, marginTop: 4 },
  label:      { color: theme.textMuted, fontSize: 12, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { backgroundColor: theme.bgInput, color: theme.text, borderRadius: 6, padding: 12, fontSize: 22, borderWidth: 1, borderColor: theme.border, textAlign: 'center', letterSpacing: 8 },
  error:      { color: theme.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
  button:     { backgroundColor: theme.primary, padding: 14, borderRadius: 6, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  back:       { color: theme.textMuted, marginTop: 16, textAlign: 'center', fontSize: 13 },

  setupBox:   { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  setupTitle: { color: theme.text, fontWeight: '600', marginBottom: 6 },
  setupBody:  { color: theme.textMuted, fontSize: 12, lineHeight: 17 },

  copyBlock:  { marginTop: 16 },
  copyLabel:  { color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  copyInput:  { backgroundColor: theme.bg, color: theme.text, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: theme.border, fontSize: 12, minHeight: 36 },
  copyInputMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn:    { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary, borderRadius: 6 },
  copyBtnText:{ color: '#fff', fontSize: 12, fontWeight: '600' },
});
