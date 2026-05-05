import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import {
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  VideoTrack,
  isTrackReference,
} from '@livekit/react-native';
import { Track, ConnectionState } from 'livekit-client';
import { theme } from '../theme';

interface Props {
  url:      string;
  token:    string;
  roomName: string;
  onLeave:  () => void;
}

export default function CallScreen({ url, token, roomName, onLeave }: Props) {
  const [error, setError] = useState<string>('');
  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
      onError={err => {
        console.warn('[livekit]', err);
        setError(err instanceof Error ? err.message : String(err));
      }}
    >
      <CallView roomName={roomName} onLeave={onLeave} error={error} />
    </LiveKitRoom>
  );
}

function CallView({ roomName, onLeave, error }: { roomName: string; onLeave: () => void; error: string }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const { localParticipant } = useLocalParticipant();
  const connState = useConnectionState();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => { localParticipant?.setMicrophoneEnabled(micOn).catch(() => {}); }, [micOn, localParticipant]);
  useEffect(() => { localParticipant?.setCameraEnabled    (camOn).catch(() => {}); }, [camOn, localParticipant]);

  // If the room kicks us (DTLS timeout, network drop), bounce back to home
  // after a short pause so the user sees what happened.
  useEffect(() => {
    if (connState !== ConnectionState.Disconnected) return;
    const t = setTimeout(onLeave, 2500);
    return () => clearTimeout(t);
  }, [connState, onLeave]);

  const statusLine = error
    ? `Failed: ${error}`
    : connState === ConnectionState.Connecting   ? 'Connecting…'
    : connState === ConnectionState.Reconnecting ? 'Reconnecting…'
    : connState === ConnectionState.Disconnected ? 'Disconnected — returning home'
    : `${tracks.length} ${tracks.length === 1 ? 'participant' : 'participants'}`;

  const statusColor =
    error || connState === ConnectionState.Disconnected            ? theme.danger
    : connState === ConnectionState.Connected                      ? theme.success
    : theme.textMuted;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onLeave} style={styles.leaveTopBtn} accessibilityLabel="Leave call">
          <Text style={styles.leaveTopText}>← Leave</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.roomName}>#{roomName}</Text>
          <Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>{statusLine}</Text>
        </View>
        <View style={styles.leaveTopBtn} />
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(_, i) => String(i)}
        numColumns={tracks.length > 1 ? 2 : 1}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <View style={[styles.tile, tracks.length > 1 && styles.tileHalf]}>
            {isTrackReference(item) ? (
              <VideoTrack trackRef={item} style={StyleSheet.absoluteFillObject} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>Camera off</Text>
              </View>
            )}
            <Text style={styles.tileLabel} numberOfLines={1}>
              {item.participant?.name || item.participant?.identity || 'unknown'}
            </Text>
          </View>
        )}
      />

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.ctlBtn, !micOn && styles.ctlBtnOff]}
          onPress={() => setMicOn(v => !v)}
          accessibilityLabel={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          <Text style={styles.ctlText}>{micOn ? 'Mic on' : 'Mic off'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctlBtn, !camOn && styles.ctlBtnOff]}
          onPress={() => setCamOn(v => !v)}
          accessibilityLabel={camOn ? 'Turn camera off' : 'Turn camera on'}
        >
          <Text style={styles.ctlText}>{camOn ? 'Cam on' : 'Cam off'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctlBtn, styles.hangup]}
          onPress={onLeave}
          accessibilityLabel="Leave call"
        >
          <Text style={[styles.ctlText, styles.hangupText]}>Leave</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 12, paddingTop: 50, gap: 8 },
  leaveTopBtn:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: theme.bgPanel, minWidth: 88 },
  leaveTopText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  roomName:     { color: theme.text, fontSize: 16, fontWeight: '600' },
  status:       { fontSize: 12, marginTop: 2 },
  grid:         { padding: 8 },
  tile:         { backgroundColor: theme.bgPanel, aspectRatio: 16/9, borderRadius: 8, marginBottom: 8, overflow: 'hidden', position: 'relative' },
  tileHalf:     { width: '48%', marginHorizontal: '1%' },
  placeholder:  { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bgPanel },
  placeholderText: { color: theme.textMuted, fontSize: 14 },
  tileLabel:    { position: 'absolute', bottom: 8, left: 8, color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  controls:     { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 16, paddingBottom: 36, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.border },
  ctlBtn:       { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 10, backgroundColor: theme.bgPanel, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border, minWidth: 96 },
  ctlBtnOff:    { backgroundColor: '#3a2222', borderColor: theme.danger },
  hangup:       { backgroundColor: theme.danger, borderColor: theme.danger },
  ctlText:      { fontSize: 14, color: theme.text, fontWeight: '600' },
  hangupText:   { color: '#fff' },
});
