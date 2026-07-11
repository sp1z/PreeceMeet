import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActionSheetIOS, useWindowDimensions, PanResponder, Animated, Platform,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
  useIOSAudioManagement,
  VideoTrack,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track, ConnectionState } from 'livekit-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme';
import { reportError } from '../errorReporter';

interface Props {
  url:      string;
  token:    string;
  roomName: string;
  onLeave:  () => void;
}

export default function CallScreen({ url, token, roomName, onLeave }: Props) {
  const [error, setError] = useState<string>('');

  // Force AVAudioSession into playAndRecord + videoChat mode BEFORE the room
  // connects. videoChat mode routes capture through Apple's voice-processing
  // I/O unit, which is the only thing that gives us hardware AEC + noise
  // suppression + AGC. If we let LiveKit's peer connection wire up the audio
  // unit first with the default mode, hardware AEC never engages — that's the
  // "echoey" iOS bug. useIOSAudioManagement below keeps this in sync per
  // room state; this initial call is what stops the race.
  useEffect(() => {
    reportError(`callscreen mount room=${roomName}`);
    let cancelled = false;
    (async () => {
      try {
        await AudioSession.configureAudio({
          ios: {
            defaultOutput:        'speaker',
            audioCategory:        'playAndRecord',
            audioMode:            'videoChat',
            audioCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'defaultToSpeaker'],
          },
        });
        if (cancelled) return;
        await AudioSession.startAudioSession();
      } catch (e) {
        reportError('audio session start failed', e);
      }
    })();
    return () => {
      cancelled = true;
      AudioSession.stopAudioSession().catch(() => {});
      reportError(`callscreen unmount room=${roomName}`);
    };
  }, [roomName]);

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video
      options={{
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
      }}
      onError={err => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[livekit]', err);
        reportError(`livekit room error room=${roomName}`, err);
        setError(msg);
      }}
    >
      <CallView roomName={roomName} onLeave={onLeave} error={error} />
    </LiveKitRoom>
  );
}

const SHOW_SELF_KEY     = 'preecemeet.call.showSelf';
const PREFER_SPEAKER_KEY = 'preecemeet.call.preferSpeaker';
type ObjectFit = 'cover' | 'contain';

function CallView({ roomName, onLeave, error }: { roomName: string; onLeave: () => void; error: string }) {
  // Top-of-render breadcrumb so the server log proves CallView at least
  // begins rendering — separate from the useEffect-based connState log,
  // which won't fire if rendering throws or the parent unmounts first.
  const renderRef = useRef(false);
  if (!renderRef.current) {
    renderRef.current = true;
    reportError(`callview first-render room=${roomName}`);
  }

  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const { localParticipant } = useLocalParticipant();
  const connState = useConnectionState();
  const room      = useRoomContext();
  const window    = useWindowDimensions();
  const isLandscape = window.width > window.height;

  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [showSelf,      setShowSelf]      = useState(false);
  const [preferSpeaker, setPreferSpeaker] = useState(true);
  const [fits,          setFits]          = useState<Record<string, ObjectFit>>({});

  // Keep AVAudioSession category/mode aligned with the room's mic/speaker
  // state (sets voiceChat mode → hardware AEC). Re-runs when preferSpeaker
  // flips so the route follows the user's preference.
  useIOSAudioManagement(room, preferSpeaker);

  // Log every connection-state transition so we can see in server logs whether
  // CallScreen makes it past 'connecting' on iOS (the call-screen freeze report).
  useEffect(() => {
    reportError(`callview connState=${connState} room=${roomName} tracks=${tracks.length}`);
  }, [connState, roomName, tracks.length]);

  // Remember show-self / speaker preferences across calls.
  useEffect(() => {
    AsyncStorage.getItem(SHOW_SELF_KEY).then(v => { if (v === 'true') setShowSelf(true); }).catch(() => {});
    AsyncStorage.getItem(PREFER_SPEAKER_KEY).then(v => { if (v === 'false') setPreferSpeaker(false); }).catch(() => {});
  }, []);
  useEffect(() => { AsyncStorage.setItem(SHOW_SELF_KEY,      String(showSelf)).catch(() => {});      }, [showSelf]);
  useEffect(() => { AsyncStorage.setItem(PREFER_SPEAKER_KEY, String(preferSpeaker)).catch(() => {}); }, [preferSpeaker]);

  // Apply the chosen iOS audio route. force_speaker keeps it on the loudspeaker
  // even if the system would otherwise prefer earpiece; 'default' lets iOS
  // route to whatever's plugged in (earpiece / wired / Bluetooth).
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AudioSession.selectAudioOutput(preferSpeaker ? 'force_speaker' : 'default').catch(() => {});
  }, [preferSpeaker]);

  useEffect(() => { localParticipant?.setMicrophoneEnabled(micOn).catch(() => {}); }, [micOn, localParticipant]);
  useEffect(() => { localParticipant?.setCameraEnabled    (camOn).catch(() => {}); }, [camOn, localParticipant]);

  // Bounce home only if we were previously connected and then got kicked.
  // Initial state is also Disconnected, so this gate avoids bouncing the user
  // out before the first connect attempt has a chance to land.
  const everConnectedRef = useRef(false);
  useEffect(() => {
    if (connState === ConnectionState.Connected) everConnectedRef.current = true;
    if (connState !== ConnectionState.Disconnected || !everConnectedRef.current) return;
    const t = setTimeout(onLeave, 2500);
    return () => clearTimeout(t);
  }, [connState, onLeave]);

  // Split into local vs remote so we can render self as PiP independently of
  // the remote tile grid.
  const { selfTrack, remoteTracks } = useMemo(() => {
    let self: TrackReferenceOrPlaceholder | null = null;
    const remote: TrackReferenceOrPlaceholder[] = [];
    for (const t of tracks) {
      if (t.participant?.isLocal) self = t;
      else remote.push(t);
    }
    return { selfTrack: self, remoteTracks: remote };
  }, [tracks]);

  // Direct-call etiquette: when the only other peer leaves a 1:1 call, drop
  // out automatically. Channel/group calls deliberately do NOT do this so
  // participants can come and go.
  const isDirect = roomName.startsWith('direct-');
  const hadRemoteRef = useRef(false);
  useEffect(() => {
    if (remoteTracks.length > 0) hadRemoteRef.current = true;
    if (isDirect && hadRemoteRef.current && remoteTracks.length === 0) {
      onLeave();
    }
  }, [isDirect, remoteTracks.length, onLeave]);

  const trackKey = useCallback((t: TrackReferenceOrPlaceholder) =>
    (isTrackReference(t) ? t.publication.trackSid : (t.participant?.identity ?? '')) || 'unknown',
  []);

  const showFitMenu = useCallback((sid: string) => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', 'Fit (contain)', 'Fill (crop)', 'Reset'], cancelButtonIndex: 0 },
      idx => {
        setFits(prev => {
          const next = { ...prev };
          if (idx === 1) next[sid] = 'contain';
          else if (idx === 2) next[sid] = 'cover';
          else if (idx === 3) delete next[sid];
          return next;
        });
      },
    );
  }, []);

  const statusLine = error
    ? `Failed: ${error}`
    : connState === ConnectionState.Connecting   ? 'Connecting…'
    : connState === ConnectionState.Reconnecting ? 'Reconnecting…'
    : connState === ConnectionState.Disconnected ? 'Disconnected — returning home'
    : remoteTracks.length === 0
      ? 'Waiting for others to join…'
      : `${remoteTracks.length} ${remoteTracks.length === 1 ? 'participant' : 'participants'}`;

  const statusColor =
    error || connState === ConnectionState.Disconnected            ? theme.danger
    : connState === ConnectionState.Connected                      ? theme.success
    : theme.textMuted;

  return (
    <View style={styles.container}>
      <View style={[styles.header, isLandscape && styles.headerLandscape]}>
        <TouchableOpacity onPress={onLeave} style={styles.leaveTopBtn} accessibilityLabel="Leave call">
          <Text style={styles.leaveTopText}>← Leave</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.roomName}>#{roomName}</Text>
          <Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>{statusLine}</Text>
        </View>
        <View style={styles.leaveTopBtn} />
      </View>

      <RemoteSurface
        tracks={remoteTracks}
        fits={fits}
        trackKey={trackKey}
        onLongPressTile={showFitMenu}
        isLandscape={isLandscape}
      />

      {showSelf && selfTrack && (
        <SelfPip track={selfTrack} headerHeight={isLandscape ? 56 : 96} />
      )}

      <View style={styles.controls}>
        <View style={styles.ctlRow}>
          <CtlBtn
            state={micOn ? 'on' : 'off'}
            stateLabel={micOn ? 'Mic on' : 'Muted'}
            actionLabel={micOn ? 'Mute' : 'Unmute'}
            onPress={() => setMicOn(v => !v)}
          />
          <CtlBtn
            state={camOn ? 'on' : 'off'}
            stateLabel={camOn ? 'Camera on' : 'Camera off'}
            actionLabel={camOn ? 'Stop video' : 'Start video'}
            onPress={() => setCamOn(v => !v)}
          />
          <CtlBtn
            state="neutral"
            stateLabel={preferSpeaker ? 'Speaker' : 'Earpiece'}
            actionLabel={preferSpeaker ? 'Use earpiece' : 'Use speaker'}
            onPress={() => setPreferSpeaker(v => !v)}
            onLongPress={() => AudioSession.showAudioRoutePicker().catch(() => {})}
          />
          <CtlBtn
            state="neutral"
            stateLabel={showSelf ? 'Self view on' : 'Self view off'}
            actionLabel={showSelf ? 'Hide self' : 'Show self'}
            onPress={() => setShowSelf(v => !v)}
          />
        </View>
        <TouchableOpacity style={styles.hangup} onPress={onLeave} accessibilityLabel="End call">
          <Text style={styles.hangupText}>End call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface CtlBtnProps {
  state:       'on' | 'off' | 'neutral';
  stateLabel:  string;
  actionLabel: string;
  onPress:     () => void;
  onLongPress?: () => void;
}

function CtlBtn({ state, stateLabel, actionLabel, onPress, onLongPress }: CtlBtnProps) {
  return (
    <TouchableOpacity
      style={[styles.ctlBtn, state === 'off' && styles.ctlBtnOff]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityLabel={actionLabel}
      accessibilityHint={stateLabel}
    >
      <Text style={[styles.ctlState, state === 'off' && styles.ctlStateOff]} numberOfLines={1}>{stateLabel}</Text>
      <Text style={styles.ctlAction} numberOfLines={1}>{actionLabel}</Text>
    </TouchableOpacity>
  );
}

interface RemoteSurfaceProps {
  tracks:          TrackReferenceOrPlaceholder[];
  fits:            Record<string, ObjectFit>;
  trackKey:        (t: TrackReferenceOrPlaceholder) => string;
  onLongPressTile: (sid: string) => void;
  isLandscape:     boolean;
}

function RemoteSurface({ tracks, fits, trackKey, onLongPressTile, isLandscape }: RemoteSurfaceProps) {
  if (tracks.length === 0) {
    return (
      <View style={styles.emptyRemote}>
        <Text style={styles.emptyRemoteText}>You're the only one here.</Text>
        <Text style={styles.emptyRemoteHint}>Send the channel link or call someone direct.</Text>
      </View>
    );
  }

  // 1 remote: full-screen.
  if (tracks.length === 1) {
    const t = tracks[0];
    const sid = trackKey(t);
    return (
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={() => onLongPressTile(sid)}
        delayLongPress={400}
        style={styles.singleSurface}
      >
        {isTrackReference(t) ? (
          <VideoTrack
            trackRef={t}
            objectFit={fits[sid] ?? 'contain'}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Camera off</Text>
          </View>
        )}
        <Text style={styles.tileLabel} numberOfLines={1}>
          {t.participant?.name || t.participant?.identity || 'unknown'}
        </Text>
      </TouchableOpacity>
    );
  }

  // 2+ remotes: tiled grid. Re-key on column count to dodge RN's
  // "changing numColumns on the fly is not supported" invariant.
  const cols = isLandscape ? Math.min(3, tracks.length) : 2;
  return (
    <FlatList
      key={`grid-${cols}`}
      data={tracks}
      keyExtractor={(item, i) => `${trackKey(item)}-${i}`}
      numColumns={cols}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => {
        const sid = trackKey(item);
        const fit: ObjectFit = fits[sid] ?? 'cover';
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => onLongPressTile(sid)}
            delayLongPress={400}
            style={[
              styles.tile,
              { width: `${100 / cols - 2}%`, marginHorizontal: '1%' },
            ]}
          >
            {isTrackReference(item) ? (
              <VideoTrack trackRef={item} objectFit={fit} style={StyleSheet.absoluteFillObject} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>Camera off</Text>
              </View>
            )}
            <Text style={styles.tileLabel} numberOfLines={1}>
              {item.participant?.name || item.participant?.identity || 'unknown'}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// Draggable picture-in-picture self view. Lives outside the FlatList so it
// stays put when remote tracks change.
function SelfPip({ track, headerHeight }: { track: TrackReferenceOrPlaceholder; headerHeight: number }) {
  const window = useWindowDimensions();
  const PIP_W  = 110;
  const PIP_H  = 150;
  const margin = 12;

  // Default bottom-right above the controls bar (~96 tall).
  const initialX = window.width  - PIP_W - margin;
  const initialY = window.height - PIP_H - 96 - margin;

  const pos = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const offset = useRef({ x: initialX, y: initialY }).current;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { pos.setOffset({ x: offset.x, y: offset.y }); pos.setValue({ x: 0, y: 0 }); },
      onPanResponderMove:  Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        const nx = clamp(offset.x + g.dx, margin, window.width  - PIP_W - margin);
        const ny = clamp(offset.y + g.dy, headerHeight + margin, window.height - PIP_H - 96 - margin);
        offset.x = nx; offset.y = ny;
        pos.flattenOffset();
        pos.setValue({ x: nx, y: ny });
      },
    }),
  ).current;

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.pip,
        { width: PIP_W, height: PIP_H, transform: pos.getTranslateTransform() },
      ]}
    >
      {isTrackReference(track) ? (
        <VideoTrack trackRef={track} objectFit="cover" style={StyleSheet.absoluteFillObject} mirror />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Cam off</Text>
        </View>
      )}
    </Animated.View>
  );
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#000' },
  header:          { flexDirection: 'row', alignItems: 'center', padding: 12, paddingTop: 50, gap: 8 },
  headerLandscape: { paddingTop: 12 },
  leaveTopBtn:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: theme.bgPanel, minWidth: 88 },
  leaveTopText:    { color: theme.text, fontSize: 14, fontWeight: '600' },
  roomName:        { color: theme.text, fontSize: 16, fontWeight: '600' },
  status:          { fontSize: 12, marginTop: 2 },

  emptyRemote:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyRemoteText: { color: theme.text, fontSize: 16, fontWeight: '600' },
  emptyRemoteHint: { color: theme.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },

  singleSurface:   { flex: 1, backgroundColor: '#000', position: 'relative' },

  grid:            { padding: 8 },
  tile:            { backgroundColor: theme.bgPanel, aspectRatio: 16/9, borderRadius: 8, marginBottom: 8, overflow: 'hidden', position: 'relative' },
  placeholder:     { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bgPanel },
  placeholderText: { color: theme.textMuted, fontSize: 14 },
  tileLabel:       { position: 'absolute', bottom: 8, left: 8, color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  pip:             { position: 'absolute', backgroundColor: theme.bgPanel, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', zIndex: 10 },

  controls:        { padding: 12, paddingBottom: 28, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.border, gap: 12 },
  ctlRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', gap: 6 },
  ctlBtn:          { flex: 1, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.bgPanel, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border, minHeight: 52 },
  ctlBtnOff:       { backgroundColor: '#3a2222', borderColor: theme.danger },
  ctlState:        { fontSize: 11, color: theme.textMuted, fontWeight: '500', marginBottom: 2 },
  ctlStateOff:     { color: theme.danger },
  ctlAction:       { fontSize: 13, color: theme.text, fontWeight: '600' },
  hangup:          { backgroundColor: theme.danger, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  hangupText:      { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
});
