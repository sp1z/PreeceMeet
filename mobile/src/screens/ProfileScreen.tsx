import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { theme } from '../theme';
import { getProfile, updateProfile, UnauthorizedError } from '../api';
import type { Session } from '../session';

interface Props {
  session:   Session;
  onClose:   () => void;
  onSignOut: () => void;
}

export default function ProfileScreen({ session, onClose, onSignOut }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [savedHint,   setSavedHint]   = useState('');

  useEffect(() => {
    let cancelled = false;
    getProfile(session.serverUrl, session.sessionToken)
      .then(p => { if (!cancelled) setDisplayName(p.displayName ?? ''); })
      .catch(e => {
        if (cancelled) return;
        if (e instanceof UnauthorizedError) { onSignOut(); return; }
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, onSignOut]);

  async function save() {
    setSaving(true); setError(''); setSavedHint('');
    try {
      const trimmed = displayName.trim();
      const p = await updateProfile(session.serverUrl, session.sessionToken,
        trimmed || null);
      setDisplayName(p.displayName ?? '');
      setSavedHint('Saved');
      setTimeout(() => setSavedHint(''), 2000);
    } catch (e) {
      if (e instanceof UnauthorizedError) { onSignOut(); return; }
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessibilityLabel="Back">
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
      ) : (
        <View style={styles.body}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.email}>{session.email}</Text>

          <Text style={[styles.label, { marginTop: 24 }]}>Display name</Text>
          <Text style={styles.hint}>What others see in their contact list and on call tiles.</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Russell"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            editable={!saving}
          />

          {error    ? <Text style={styles.error}>{error}</Text>      : null}
          {savedHint ? <Text style={styles.saved}>{savedHint}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 50 },
  back:          { color: theme.text, fontSize: 28, width: 32 },
  title:         { color: theme.text, fontSize: 17, fontWeight: '600' },
  body:          { padding: 24 },
  label:         { color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  email:         { color: theme.text, fontSize: 15 },
  hint:          { color: theme.textMuted, fontSize: 12, marginBottom: 8 },
  input:         { backgroundColor: theme.bgInput, borderRadius: 8, padding: 12, color: theme.text, fontSize: 15, borderWidth: 1, borderColor: theme.border },
  error:         { color: theme.danger, fontSize: 13, marginTop: 12 },
  saved:         { color: theme.success, fontSize: 13, marginTop: 12 },
  saveBtn:       { marginTop: 24, backgroundColor: theme.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
});
