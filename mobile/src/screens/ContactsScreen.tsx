import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { theme } from '../theme';
import { getUsers, ContactUser, UnauthorizedError } from '../api';
import type { Session } from '../session';

interface Props {
  session:   Session;
  online:    Set<string>;
  inCall:    boolean;
  onCall:    (email: string) => Promise<{ ok: boolean; error?: string }>;
  onClose:   () => void;
  onSignOut: () => void;
}

export default function ContactsScreen({ session, online, inCall, onCall, onClose, onSignOut }: Props) {
  const [users,   setUsers]   = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [calling, setCalling] = useState('');

  useEffect(() => {
    let cancelled = false;
    getUsers(session.serverUrl, session.sessionToken)
      .then(u => { if (!cancelled) setUsers(u); })
      .catch(e => {
        if (cancelled) return;
        if (e instanceof UnauthorizedError) { onSignOut(); return; }
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, onSignOut]);

  const merged = users
    .map(u => ({ ...u, online: online.has(u.email.toLowerCase()) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.email.localeCompare(b.email));

  async function handleCall(email: string) {
    setCalling(email); setError('');
    const r = await onCall(email);
    setCalling('');
    if (!r.ok) setError(r.error || 'Call failed');
    else onClose();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}><Text style={styles.back}>←</Text></TouchableOpacity>
        <Text style={styles.title}>Contacts</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading && <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {!loading && merged.length === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>
            No other users registered yet.
          </Text>
        )}
        {merged.map(u => (
          <View key={u.email} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: u.online ? theme.success : theme.border }]} />
            <Text style={styles.email}>{u.email}</Text>
            <Text style={styles.statusText}>{u.online ? 'online' : 'offline'}</Text>
            <TouchableOpacity
              style={[styles.callBtn, (!u.online || inCall || calling === u.email) && styles.callBtnDisabled]}
              onPress={() => void handleCall(u.email)}
              disabled={!u.online || inCall || calling === u.email}
            >
              <Text style={styles.callBtnText}>{calling === u.email ? '…' : 'Call'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: theme.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 50 },
  back:             { color: theme.text, fontSize: 28, width: 32 },
  title:            { color: theme.text, fontSize: 17, fontWeight: '600' },
  error:            { color: theme.danger, padding: 16 },
  row:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 10 },
  dot:              { width: 8, height: 8, borderRadius: 4 },
  email:            { color: theme.text, fontSize: 14, flex: 1 },
  statusText:       { color: theme.textMuted, fontSize: 11, width: 50 },
  callBtn:          { backgroundColor: theme.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  callBtnDisabled:  { backgroundColor: theme.border },
  callBtnText:      { color: '#fff', fontSize: 13, fontWeight: '600' },
});
