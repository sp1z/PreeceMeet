import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { IncomingCall, OutgoingCall } from '../calling';

interface IncomingProps {
  call:      IncomingCall;
  onAccept:  () => void;
  onDecline: () => void;
}

export function IncomingCallModal({ call, onAccept, onDecline }: IncomingProps) {
  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.label}>Incoming call</Text>
          <Text style={styles.from}>{call.from}</Text>
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
    </Modal>
  );
}

interface OutgoingProps {
  call:     OutgoingCall;
  onCancel: () => void;
}

export function OutgoingCallModal({ call, onCancel }: OutgoingProps) {
  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.label}>Calling…</Text>
          <Text style={styles.from}>{call.to}</Text>
          <TouchableOpacity style={[styles.btn, styles.decline, { width: 200 }]} onPress={onCancel}>
            <Text style={styles.btnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card:      { backgroundColor: theme.bgPanel, borderRadius: 14, padding: 28, alignItems: 'center', minWidth: 280, borderWidth: 1, borderColor: theme.border },
  label:     { color: theme.textMuted, fontSize: 13 },
  from:      { color: theme.text, fontSize: 18, fontWeight: '700', marginVertical: 14, textAlign: 'center' },
  row:       { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn:       { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, alignItems: 'center', minWidth: 110 },
  accept:    { backgroundColor: theme.success },
  decline:   { backgroundColor: theme.danger },
  btnText:   { color: '#0a0a14', fontWeight: '700', fontSize: 14 },
});
