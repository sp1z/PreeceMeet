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
  const gridClass = gameMode
    ? 'game-mode-grid'
    : count === 1 ? 'one-participant' : count >= 3 ? 'many-participants' : '';

  return (
    <div className={`video-grid ${gridClass}`}>
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
