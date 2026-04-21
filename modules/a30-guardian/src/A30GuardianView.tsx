import { requireNativeView } from 'expo';
import * as React from 'react';

import { A30GuardianViewProps } from './A30Guardian.types';

const NativeView: React.ComponentType<A30GuardianViewProps> =
  requireNativeView('A30Guardian');

export default function A30GuardianView(props: A30GuardianViewProps) {
  return <NativeView {...props} />;
}
