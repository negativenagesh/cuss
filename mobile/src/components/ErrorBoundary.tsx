import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** What to render instead when the subtree crashes. Defaults to a readable error screen. */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render crashes so the app shows the problem instead of closing, with a one-tap retry. */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return <>{this.props.fallback}</>;
      return (
        <View style={{ flex: 1, backgroundColor: '#07070C', padding: 24, justifyContent: 'center' }}>
          <Text style={{ color: '#D4FF00', fontSize: 22, fontWeight: '800', marginBottom: 6 }}>
            CUSS // RECOVERABLE FAULT
          </Text>
          <ScrollView style={{ maxHeight: 280, marginBottom: 16 }}>
            <Text style={{ color: '#F4F0EA', fontSize: 13 }}>
              {String(this.state.error?.message ?? this.state.error)}
              {'\n\n'}
              {String(this.state.error?.stack ?? '').slice(0, 1500)}
            </Text>
          </ScrollView>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{
              backgroundColor: '#D4FF00',
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#07070C', fontWeight: '800', fontSize: 14 }}>
              RECOVER DECK
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
