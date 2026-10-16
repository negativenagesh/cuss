import React from 'react';
import { View } from 'react-native';

/**
 * Zero-flicker container for list items.
 * Guarantees 100% immediate visibility inside virtualized FlatLists so items never get stuck at opacity=0 on rapid sync updates.
 */
export default function FadeIn({
  children,
}: {
  delay?: number;
  children: React.ReactNode;
}) {
  return <View>{children}</View>;
}
