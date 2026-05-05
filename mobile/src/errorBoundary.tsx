// Catches render-time exceptions in CallScreen so a thrown error during a
// LiveKit teardown/setup race doesn't unwind the whole app. Pairs with
// installGlobalErrorHandler() — that catches errors thrown outside React
// (event handlers, async callbacks); this catches errors thrown inside it.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from './theme';
import { reportError } from './errorReporter';

interface Props {
  children: React.ReactNode;
  onReset:  () => void;
  label:    string;
}

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(`ErrorBoundary[${this.props.label}] caught`, error);
    if (info?.componentStack) reportError(`  componentStack`, new Error(info.componentStack));
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message} numberOfLines={6}>{error.message || String(error)}</Text>
        <TouchableOpacity style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 24, paddingTop: 80, alignItems: 'center' },
  title:     { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  message:   { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 24 },
  button:    { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.primary },
  buttonText:{ color: '#fff', fontSize: 14, fontWeight: '600' },
});
