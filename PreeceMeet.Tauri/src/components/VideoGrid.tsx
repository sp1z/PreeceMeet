import { useTracks, ParticipantTile } from '@livekit/components-react';
import { Track } from 'livekit-client';

interface Props {
  gameMode?: boolean;
}

export default function VideoGrid({ gameMode }: Props) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const count = tracks.length;

  // Column count mirrors the WPF UniformGrid logic: 1→1, 2-4→2, 5-9→3, 10+→4
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;

  return (
    <div
      className={`video-grid${gameMode ? ' game-mode-grid' : ''}`}
      style={!gameMode ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}
    >
      {tracks.map(track => {
        const isLocalCamera = track.participant.isLocal && track.source === Track.Source.Camera;
        return (
          <div
            key={`${track.participant.sid}-${track.source}`}
            className={isLocalCamera ? 'local-camera-tile' : undefined}
          >
            <ParticipantTile trackRef={track} />
          </div>
        );
      })}
    </div>
  );
}
