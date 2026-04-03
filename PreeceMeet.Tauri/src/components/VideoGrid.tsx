import { useTracks, ParticipantTile } from '@livekit/components-react';
import { Track } from 'livekit-client';

export default function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const count = tracks.length;
  const gridClass = count === 1 ? 'one-participant' : count >= 3 ? 'many-participants' : '';

  return (
    <div className={`video-grid ${gridClass}`}>
      {tracks.map(track => (
        <ParticipantTile
          key={`${track.participant.sid}-${track.source}`}
          trackRef={track}
        />
      ))}
    </div>
  );
}
