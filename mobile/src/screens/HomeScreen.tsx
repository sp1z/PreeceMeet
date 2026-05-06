import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SectionList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { theme } from '../theme';
import {
  getRooms, getRoomToken, getUsers, getChannels,
  RoomInfo, ContactUser, Channel, UnauthorizedError,
} from '../api';
import type { Session } from '../session';

interface Props {
  session:        Session;
  online:         Set<string>;
  inCall:         boolean;
  onJoinChannel:  (room: string, livekitUrl: string, livekitToken: string) => void;
  onCall:         (email: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenProfile:  () => void;
  onSignOut:      () => void;
}

type ChannelRow = { kind: 'channel'; name: string; displayName: string; emoji: string; numParticipants: number; participantNames: string[]; };
type ContactRow = { kind: 'contact'; email: string; displayName: string | null; online: boolean; };
type Row = ChannelRow | ContactRow;
type Section = { title: 'Channels' | 'Direct'; data: Row[]; };

export default function HomeScreen({ session, online, inCall, onJoinChannel, onCall, onOpenProfile, onSignOut }: Props) {
  const [rooms,      setRooms]      = useState<RoomInfo[]>([]);
  const [users,      setUsers]      = useState<ContactUser[]>([]);
  const [channels,   setChannels]   = useState<Channel[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy,       setBusy]       = useState('');   // channel name or contact email
  const [error,      setError]      = useState('');

  const refresh = useCallback(async () => {
    try {
      const [r, u, c] = await Promise.all([
        getRooms   (session.serverUrl, session.sessionToken),
        getUsers   (session.serverUrl, session.sessionToken).catch(() => [] as ContactUser[]),
        getChannels(session.serverUrl, session.sessionToken).catch(() => [] as Channel[]),
      ]);
      setRooms(r);
      setUsers(u);
      if (c.length) setChannels(c);   // keep last good list if endpoint blips
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
    if (busy) return;
    setBusy(name); setError('');
    try {
      const r = await getRoomToken(session.serverUrl, session.sessionToken, name);
      onJoinChannel(name, r.livekitUrl, r.livekitToken);
    } catch (e) {
      if (e instanceof UnauthorizedError) { onSignOut(); return; }
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally { setBusy(''); }
  }

  async function callContact(email: string, isOnline: boolean) {
    if (busy || !isOnline || inCall) return;
    setBusy(email); setError('');
    const r = await onCall(email);
    setBusy('');
    if (!r.ok) setError(r.error || 'Call failed');
  }

  const sections: Section[] = useMemo(() => {
    // Canonical channel list comes from the server. Fold live-room participant
    // counts into each entry by matching `name`.
    const liveByName = new Map(rooms.map(r => [r.name, r] as const));
    const channelRows: ChannelRow[] = channels.map(c => {
      const live = liveByName.get(c.name);
      return {
        kind:             'channel' as const,
        name:             c.name,
        displayName:      c.displayName,
        emoji:            c.emoji,
        numParticipants:  live?.numParticipants  ?? 0,
        participantNames: live?.participantNames ?? [],
      };
    });
    const contacts: ContactRow[] = users
      .map(u => ({
        kind:        'contact' as const,
        email:       u.email,
        displayName: u.displayName ?? null,
        online:      online.has(u.email.toLowerCase()),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.email.localeCompare(b.email));
    return [
      { title: 'Channels', data: channelRows },
      { title: 'Direct',   data: contacts },
    ];
  }, [rooms, users, channels, online]);

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.title}>PreeceMeet</Text>
        <View style={styles.topbarActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenProfile} accessibilityLabel="Profile">
            <Text style={styles.iconText}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onSignOut} accessibilityLabel="Sign out">
            <Text style={styles.iconText}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.email}>{session.email}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.kind === 'channel' ? `c-${item.name}` : `u-${item.email}-${i}`}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}
              tintColor={theme.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionLabel}>{section.title}</Text>
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <Text style={styles.emptyText}>
                {section.title === 'Direct'
                  ? 'No other users yet — invite a colleague.'
                  : 'No channels yet.'}
              </Text>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'channel' ? (
              <TouchableOpacity
                style={styles.row}
                onPress={() => void joinRoom(item.name)}
                disabled={!!busy}
              >
                <Text style={styles.channelEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.displayName}</Text>
                  <Text style={styles.rowMeta}>
                    {item.numParticipants > 0
                      ? `${item.numParticipants} online${item.participantNames.length ? ': ' + item.participantNames.join(', ') : ''}`
                      : 'Empty — join to start a call'}
                  </Text>
                </View>
                {busy === item.name
                  ? <ActivityIndicator color={theme.primary} />
                  : <Text style={styles.joinChevron}>›</Text>}
              </TouchableOpacity>
            ) : (
              <View style={styles.contactRow}>
                <View style={[styles.dot, { backgroundColor: item.online ? theme.success : theme.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.displayName?.trim() || item.email}</Text>
                  <Text style={styles.rowMeta}>
                    {item.displayName?.trim() ? `${item.email} · ` : ''}
                    {item.online ? 'online' : 'offline'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.callBtn,
                    (!item.online || inCall || !!busy) && styles.callBtnDisabled,
                  ]}
                  onPress={() => void callContact(item.email, item.online)}
                  disabled={!item.online || inCall || !!busy}
                >
                  <Text style={styles.callBtnText}>
                    {busy === item.email ? '…' : 'Call'}
                  </Text>
                </TouchableOpacity>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
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
  email:        { color: theme.textMuted, fontSize: 12, marginBottom: 16 },
  sectionLabel: { color: theme.textMuted, fontSize: 11, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgPanel, padding: 14, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.border, gap: 12 },
  channelEmoji: { fontSize: 22 },
  contactRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgPanel, padding: 14, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.border, gap: 10 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  rowTitle:     { color: theme.text, fontSize: 15, fontWeight: '600' },
  rowMeta:      { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  joinChevron:  { color: theme.textMuted, fontSize: 22 },
  callBtn:      { backgroundColor: theme.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  callBtnDisabled: { backgroundColor: theme.border },
  callBtnText:  { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyText:    { color: theme.textMuted, fontSize: 12, paddingVertical: 8, paddingHorizontal: 4, fontStyle: 'italic' },
  error:        { color: theme.danger, fontSize: 13, marginBottom: 8 },
});
