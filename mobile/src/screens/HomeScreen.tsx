import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { theme } from '../theme';
import { getRooms, getRoomToken, RoomInfo, UnauthorizedError } from '../api';
import type { Session } from '../session';

interface Props {
  session:        Session;
  onJoinChannel:  (room: string, livekitUrl: string, livekitToken: string) => void;
  onOpenContacts: () => void;
  onSignOut:      () => void;
}

export default function HomeScreen({ session, onJoinChannel, onOpenContacts, onSignOut }: Props) {
  const [rooms,     setRooms]     = useState<RoomInfo[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining,   setJoining]   = useState('');
  const [error,     setError]     = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await getRooms(session.serverUrl, session.sessionToken);
      setRooms(r);
      setError('');
    } catch (e) {
      if (e instanceof UnauthorizedError) { onSignOut(); return; }
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [session, onSignOut]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function joinRoom(name: string) {
    if (joining) return;
    setJoining(name); setError('');
    try {
      const r = await getRoomToken(session.serverUrl, session.sessionToken, name);
      onJoinChannel(name, r.livekitUrl, r.livekitToken);
    } catch (e) {
      if (e instanceof UnauthorizedError) { onSignOut(); return; }
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally { setJoining(''); }
  }

  const presetChannels = ['preecemeet', 'general'];
  const liveNames = new Set(rooms.map(r => r.name));
  const allChannels = [
    ...rooms,
    ...presetChannels.filter(n => !liveNames.has(n))
      .map(name => ({ name, numParticipants: 0, participantNames: [] })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.title}>PreeceMeet</Text>
        <View style={styles.topbarActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenContacts}>
            <Text style={styles.iconText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onSignOut}>
            <Text style={styles.iconText}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.email}>{session.email}</Text>

      <Text style={styles.sectionLabel}>Channels</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}
              tintColor={theme.primary}
            />
          }
        >
          {allChannels.map(r => (
            <TouchableOpacity
              key={r.name}
              style={styles.row}
              onPress={() => void joinRoom(r.name)}
              disabled={!!joining}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>#{r.name}</Text>
                <Text style={styles.rowMeta}>
                  {r.numParticipants > 0
                    ? `${r.numParticipants} online${r.participantNames.length ? ': ' + r.participantNames.join(', ') : ''}`
                    : 'Empty — join to start a call'}
                </Text>
              </View>
              {joining === r.name ? <ActivityIndicator color={theme.primary} />
                : <Text style={styles.joinChevron}>›</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: theme.bg, padding: 16, paddingTop: 50 },
  topbar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  topbarActions:{ flexDirection: 'row', gap: 8 },
  title:        { color: theme.text, fontSize: 20, fontWeight: '700' },
  iconBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: theme.bgPanel, justifyContent: 'center', alignItems: 'center' },
  iconText:     { fontSize: 18, color: theme.text },
  email:        { color: theme.textMuted, fontSize: 12, marginBottom: 24 },
  sectionLabel: { color: theme.textMuted, fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgPanel, padding: 14, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  rowTitle:     { color: theme.text, fontSize: 15, fontWeight: '600' },
  rowMeta:      { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  joinChevron:  { color: theme.textMuted, fontSize: 22 },
  error:        { color: theme.danger, fontSize: 13, marginBottom: 8 },
});
