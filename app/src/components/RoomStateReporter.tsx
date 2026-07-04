// Small in-room helper: reports the local participant's connection quality
// up to MainPage so the top bar can render a quality glyph. Sits inside
// LiveKitRoom (so it has access to useLocalParticipant / room events).

import { useEffect } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { ConnectionQuality, RoomEvent } from 'livekit-client';

type Quality = 'excellent' | 'good' | 'poor' | 'unknown';

function map(q: ConnectionQuality | undefined): Quality {
  switch (q) {
    case ConnectionQuality.Excellent: return 'excellent';
    case ConnectionQuality.Good:      return 'good';
    case ConnectionQuality.Poor:      return 'poor';
    default:                          return 'unknown';
  }
}

export default function RoomStateReporter({ onQuality }: { onQuality: (q: Quality) => void }) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  useEffect(() => {
    onQuality(map(localParticipant?.connectionQuality));

    const handler = () => onQuality(map(localParticipant?.connectionQuality));
    room.on(RoomEvent.ConnectionQualityChanged, handler);
    return () => { room.off(RoomEvent.ConnectionQualityChanged, handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, localParticipant?.sid]);

  return null;
}
