import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { theme } from '../theme';
import { login, LoginResult } from '../api';
import { loadServerUrl, saveServerUrl } from '../session';

interface Props {
  onLoginDone: (serverUrl: string, email: string, result: LoginResult) => void;
}

export default function LoginScreen({ onLoginDone }: Props) {
  const [serverUrl, setServerUrl] = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => { loadServerUrl().then(setServerUrl); }, []);

  async function submit() {
    if (!email || !password || !serverUrl) {
      setError('All fields required'); return;
    }
    setLoading(true); setError('');
    try {
      await saveServerUrl(serverUrl);
      const result = await login(serverUrl, email.trim().toLowerCase(), password);
      onLoginDone(serverUrl, email.trim().toLowerCase(), result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>PreeceMeet</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <Text style={styles.label}>Server</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://meet.russellpreece.com"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: 20 },
  card:      { backgroundColor: theme.bgPanel, borderRadius: 12, padding: 24, borderWidth: 1, borderColor: theme.border },
  title:     { color: theme.text, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle:  { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 20, marginTop: 4 },
  label:     { color: theme.textMuted, fontSize: 12, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:     { backgroundColor: theme.bgInput, color: theme.text, borderRadius: 6, padding: 12, fontSize: 15, borderWidth: 1, borderColor: theme.border },
  error:     { color: theme.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
  button:    { backgroundColor: theme.primary, padding: 14, borderRadius: 6, marginTop: 20, alignItems: 'center' },
  buttonText:{ color: '#fff', fontSize: 15, fontWeight: '600' },
});
