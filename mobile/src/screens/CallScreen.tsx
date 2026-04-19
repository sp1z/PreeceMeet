import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import {
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  VideoTrack,
  isTrackReference,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { theme } from '../theme';

interface Props {
  url:      string;
  token:    string;
  roomName: string;
  onLeave:  () => void;
}

export default function CallScreen({ url, token, roomName, onLeave }: Props) {
  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video
      options={{ adaptiveStream: { pixelDensity: 'screen' } }}
      onError={err => console.warn('[livekit]', err)}
    >
      <CallView roomName={roomName} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function CallView({ roomName, onLeave }: { roomName: string; onLeave: () => void }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => { localParticipant?.setMicrophoneEnabled(micOn).catch(() => {}); }, [micOn, localParticipant]);
  useEffect(() => { localParticipant?.setCameraEnabled    (camOn).catch(() => {}); }, [camOn, localParticipant]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roomName}>#{roomName}</Text>
        <Text style={styles.count}>{tracks.length} {tracks.length === 1 ? 'participant' : 'participants'}</Text>
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
                <Text style={styles.placeholderText}>📷 off</Text>
              </View>
            )}
            <Text style={styles.tileLabel} numberOfLines={1}>
              {item.participant?.name || item.participant?.identity || 'unknown'}
            </Text>
          </View>
        )}
      />

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctlBtn, !micOn && styles.ctlBtnOff]} onPress={() => setMicOn(v => !v)}>
          <Text style={styles.ctlText}>{micOn ? '🎤' : '🚫'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctlBtn, !camOn && styles.ctlBtnOff]} onPress={() => setCamOn(v => !v)}>
          <Text style={styles.ctlText}>{camOn ? '📹' : '🚫'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctlBtn, styles.hangup]} onPress={onLeave}>
          <Text style={styles.ctlText}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 50 },
  roomName:     { color: theme.text, fontSize: 16, fontWeight: '600' },
  count:        { color: theme.textMuted, fontSize: 12 },
  grid:         { padding: 8 },
  tile:         { backgroundColor: theme.bgPanel, aspectRatio: 16/9, borderRadius: 8, marginBottom: 8, overflow: 'hidden', position: 'relative' },
  tileHalf:     { width: '48%', marginHorizontal: '1%' },
  placeholder:  { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bgPanel },
  placeholderText: { color: theme.textMuted, fontSize: 18 },
  tileLabel:    { position: 'absolute', bottom: 8, left: 8, color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  controls:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 20, paddingBottom: 40, backgroundColor: theme.bg },
  ctlBtn:       { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.bgPanel, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  ctlBtnOff:    { backgroundColor: theme.danger },
  hangup:       { backgroundColor: theme.danger, transform: [{ rotate: '135deg' }] },
  ctlText:      { fontSize: 22 },
});
