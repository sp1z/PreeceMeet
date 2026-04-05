import { useState, useEffect, useRef } from 'react';
import { useTracks, ParticipantTile, useRoomContext } from '@livekit/components-react';
import { Track, RemoteTrackPublication } from 'livekit-client';

const TILE_ORDER_KEY = 'preecemeet_tile_order';

interface Props {
  gameMode?: boolean;
  statsVisible?: boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatsTile() {
  const room = useRoomContext();
  const startRef = useRef(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  // Silence the unused-variable warning — tick is only used to trigger re-renders
  void tick;

  const duration = Date.now() - startRef.current;
  const remoteParticipants = Array.from(room.remoteParticipants.values());
  const totalParticipants = remoteParticipants.length + 1; // +1 for local

  const isConnected = room.state === 'connected';

  return (
    <div className="stats-tile">
      <div className="stats-header">📊 Session Stats</div>
      <div className="stats-row">
        Status:{' '}
        <span className={isConnected ? 'stats-ok' : 'stats-err'}>
          {room.state}
        </span>
      </div>
      <div className="stats-row">Duration: {formatDuration(duration)}</div>
      <div className="stats-row">Participants: {totalParticipants}</div>
      <div className="stats-divider" />
      <div className="stats-row" style={{ fontWeight: 600, marginBottom: 4 }}>
        You ({room.localParticipant.identity})
      </div>
      {remoteParticipants.map(p => {
        const audioMuted = !p.isMicrophoneEnabled;
        const videoMuted = !p.isCameraEnabled;
        return (
          <div key={p.sid} className="stats-participant">
            <span>{p.identity || p.name || p.sid}</span>
            <span>
              {audioMuted ? '🔇' : '🎤'} {videoMuted ? '📵' : '📹'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function VideoGrid({ gameMode, statsVisible }: Props) {
  const room = useRoomContext();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TILE_ORDER_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [locallyMuted, setLocallyMuted] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ sid: string; x: number; y: number } | null>(null);
  const [dragSid, setDragSid] = useState<string | null>(null);
  const [dragOverSid, setDragOverSid] = useState<string | null>(null);

  // Close context menu on any window click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // Sort tracks: pinned first (by order array), local participant first when not in array
  const sortedTracks = [...tracks].sort((a, b) => {
    const sidA = `${a.participant.sid}-${a.source}`;
    const sidB = `${b.participant.sid}-${b.source}`;
    const iA = order.indexOf(sidA);
    const iB = order.indexOf(sidB);

    // If both are in the order array, sort by index
    if (iA !== -1 && iB !== -1) return iA - iB;
    // If only A is in array, A comes first
    if (iA !== -1) return -1;
    // If only B is in array, B comes first
    if (iB !== -1) return 1;
    // Neither in array: local participant first
    if (a.participant.isLocal && !b.participant.isLocal) return -1;
    if (!a.participant.isLocal && b.participant.isLocal) return 1;
    return 0;
  });

  const count = sortedTracks.length + (statsVisible ? 1 : 0);
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  function handleDragStart(sid: string) {
    setDragSid(sid);
  }

  function handleDragOver(e: React.DragEvent, sid: string) {
    e.preventDefault();
    setDragOverSid(sid);
  }

  function handleDrop(targetSid: string) {
    if (!dragSid || dragSid === targetSid) {
      setDragSid(null);
      setDragOverSid(null);
      return;
    }

    const currentOrder = sortedTracks.map(t => `${t.participant.sid}-${t.source}`);
    const fromIdx = currentOrder.indexOf(dragSid);
    const toIdx   = currentOrder.indexOf(targetSid);

    if (fromIdx === -1 || toIdx === -1) {
      setDragSid(null);
      setDragOverSid(null);
      return;
    }

    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragSid);

    setOrder(newOrder);
    localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(newOrder));
    setDragSid(null);
    setDragOverSid(null);
  }

  function handleDragEnd() {
    setDragSid(null);
    setDragOverSid(null);
  }

  function handleContextMenu(e: React.MouseEvent, sid: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ sid, x: e.clientX, y: e.clientY });
  }

  function handleMuteLocally(sid: string) {
    setLocallyMuted(prev => {
      const next = new Set(prev);
      const nowMuted = !next.has(sid);
      if (nowMuted) {
        next.add(sid);
      } else {
        next.delete(sid);
      }

      // remoteParticipants is keyed by identity, so find by SID
      const participant = [...room.remoteParticipants.values()].find(p => p.sid === sid);
      if (participant) {
        participant.trackPublications.forEach(pub => {
          if (pub.kind === Track.Kind.Audio) {
            (pub as RemoteTrackPublication).setSubscribed(!nowMuted);
          }
        });
      }

      return next;
    });
    setContextMenu(null);
  }

  function handlePinToTop(sid: string) {
    const currentOrder = sortedTracks.map(t => `${t.participant.sid}-${t.source}`);
    // Find all keys for this participant SID
    const participantKeys = currentOrder.filter(k => k.startsWith(sid + '-'));
    const rest = currentOrder.filter(k => !participantKeys.includes(k));
    const newOrder = [...participantKeys, ...rest];
    setOrder(newOrder);
    localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(newOrder));
    setContextMenu(null);
  }

  const contextMenuParticipant = contextMenu
    ? tracks.find(t => t.participant.sid === contextMenu.sid)?.participant ?? null
    : null;

  return (
    <>
      <div
        className={`video-grid${gameMode ? ' game-mode-grid' : ''}`}
        style={!gameMode ? {
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows:    `repeat(${rows}, 1fr)`,
        } : undefined}
      >
        {sortedTracks.map(track => {
          const tileSid = `${track.participant.sid}-${track.source}`;
          const isLocalCamera = track.participant.isLocal && track.source === Track.Source.Camera;
          const isMuted = locallyMuted.has(track.participant.sid);
          const isDragOver = dragOverSid === tileSid;

          return (
            <div
              key={tileSid}
              className={[
                'tile-wrapper',
                isLocalCamera ? 'local-camera-tile' : '',
                isDragOver ? 'drag-over' : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={() => handleDragStart(tileSid)}
              onDragOver={e => handleDragOver(e, tileSid)}
              onDrop={() => handleDrop(tileSid)}
              onDragEnd={handleDragEnd}
              onContextMenu={e => handleContextMenu(e, track.participant.sid)}
            >
              <ParticipantTile trackRef={track} />
              {isMuted && (
                <div className="tile-muted-badge">🔇 muted locally</div>
              )}
            </div>
          );
        })}

        {statsVisible && <StatsTile />}
      </div>

      {contextMenu && (
        <div
          className="tile-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenuParticipant && !contextMenuParticipant.isLocal && (
            <button onClick={() => handleMuteLocally(contextMenu.sid)}>
              {locallyMuted.has(contextMenu.sid) ? '🔊 Unmute for me' : '🔇 Mute for me'}
            </button>
          )}
          <button onClick={() => handlePinToTop(contextMenu.sid)}>
            📌 Pin to top
          </button>
        </div>
      )}
    </>
  );
}
