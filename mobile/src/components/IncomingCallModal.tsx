import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { IncomingCall, OutgoingCall } from '../calling';

// NOTE: Deliberately not using <Modal> from react-native. iOS's native modal
// presentation appears to interfere with <LiveKitRoom> mounting underneath
// it — the room's children never render once the modal closes. Plain overlay
// View on top of the parent stack avoids the whole UIViewController dance.

interface IncomingProps {
  call:      IncomingCall;
  onAccept:  () => void;
  onDecline: () => void;
}

export function IncomingCallModal({ call, onAccept, onDecline }: IncomingProps) {
  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <View style={styles.card}>
        <Text style={styles.label}>Incoming call</Text>
        <Text style={styles.from}>{call.fromDisplayName?.trim() || call.from}</Text>
        {call.fromDisplayName?.trim() ? <Text style={styles.fromEmail}>{call.from}</Text> : null}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.decline]} onPress={onDecline}>
            <Text style={styles.btnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.accept]} onPress={onAccept}>
            <Text style={styles.btnText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

interface OutgoingProps {
  call:     OutgoingCall;
  onCancel: () => void;
}

export function OutgoingCallModal({ call, onCancel }: OutgoingProps) {
  return (
    <View style={styles.backdrop} pointerEvents="auto">
      <View style={styles.card}>
        <Text style={styles.label}>Calling…</Text>
        <Text style={styles.from}>{call.to}</Text>
        <TouchableOpacity style={[styles.btn, styles.decline, { width: 200 }]} onPress={onCancel}>
          <Text style={styles.btnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 100, elevation: 100 },
  card:      { backgroundColor: theme.bgPanel, borderRadius: 14, padding: 28, alignItems: 'center', minWidth: 280, borderWidth: 1, borderColor: theme.border },
  label:     { color: theme.textMuted, fontSize: 13 },
  from:      { color: theme.text, fontSize: 18, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  fromEmail: { color: theme.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  row:       { flexDirection: 'row', gap: 12, marginTop: 18 },
  btn:       { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, alignItems: 'center', minWidth: 110 },
  accept:    { backgroundColor: theme.success },
  decline:   { backgroundColor: theme.danger },
  btnText:   { color: '#0a0a14', fontWeight: '700', fontSize: 14 },
});
