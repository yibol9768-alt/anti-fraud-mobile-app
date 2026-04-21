import * as React from 'react';

import { A30GuardianViewProps } from './A30Guardian.types';

export default function A30GuardianView(props: A30GuardianViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
