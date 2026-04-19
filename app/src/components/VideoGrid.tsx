import { useState, useEffect, useRef } from 'react';
import { useTracks, ParticipantTile, useRoomContext } from '@livekit/components-react';
import { Track, RemoteTrackPublication } from 'livekit-client';

const TILE_ORDER_KEY = 'preecemeet_tile_order';
const TILE_SCALE_KEY = 'preecemeet_tile_scale';

export type GameSize = 'small' | 'medium' | 'large';
export type TileScale = 'cover' | 'contain';

export const GAME_SIZES: Record<GameSize, number> = {
  small:  150,
  medium: 200,
  large:  300,
};

interface Props {
  gameMode?:     boolean;
  gameSize?:     GameSize;
  showSelf?:     boolean;
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

  void tick;

  const duration = Date.now() - startRef.current;
  const remoteParticipants = Array.from(room.remoteParticipants.values());
  const totalParticipants = remoteParticipants.length + 1;

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

export default function VideoGrid({ gameMode, gameSize = 'medium', showSelf = false, statsVisible }: Props) {
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

  // Per-tile scale override (cover|contain). Persisted by participant SID +
  // source so it survives reconnects. Default falls through to CSS:
  // camera = cover, screen_share = contain.
  const [scaleOverrides, setScaleOverrides] = useState<Record<string, TileScale>>(() => {
    try {
      const raw = localStorage.getItem(TILE_SCALE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [locallyMuted, setLocallyMuted] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ sid: string; tileKey: string; source: string; x: number; y: number } | null>(null);
  const [dragSid, setDragSid] = useState<string | null>(null);
  const [dragOverSid, setDragOverSid] = useState<string | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const sortedTracks = [...tracks].sort((a, b) => {
    const sidA = `${a.participant.sid}-${a.source}`;
    const sidB = `${b.participant.sid}-${b.source}`;
    const iA = order.indexOf(sidA);
    const iB = order.indexOf(sidB);
    if (iA !== -1 && iB !== -1) return iA - iB;
    if (iA !== -1) return -1;
    if (iB !== -1) return 1;
    if (a.participant.isLocal && !b.participant.isLocal) return -1;
    if (!a.participant.isLocal && b.participant.isLocal) return 1;
    return 0;
  });

  // Game mode: only camera tracks of *other* participants by default. Screen
  // shares are kept publishing but not displayed. "Show Self" pulls our own
  // camera tile back in for self-monitoring.
  const visibleTracks = gameMode
    ? sortedTracks.filter(t =>
        t.source !== Track.Source.ScreenShare &&
        (showSelf || !t.participant.isLocal),
      )
    : sortedTracks;

  const count = visibleTracks.length + (statsVisible && !gameMode ? 1 : 0);
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  function handleDragStart(sid: string) { setDragSid(sid); }

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
    const currentOrder = visibleTracks.map(t => `${t.participant.sid}-${t.source}`);
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

  function handleContextMenu(e: React.MouseEvent, sid: string, tileKey: string, source: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ sid, tileKey, source, x: e.clientX, y: e.clientY });
  }

  function handleMuteLocally(sid: string) {
    setLocallyMuted(prev => {
      const next = new Set(prev);
      const nowMuted = !next.has(sid);
      if (nowMuted) next.add(sid); else next.delete(sid);
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
    const currentOrder = visibleTracks.map(t => `${t.participant.sid}-${t.source}`);
    const participantKeys = currentOrder.filter(k => k.startsWith(sid + '-'));
    const rest = currentOrder.filter(k => !participantKeys.includes(k));
    const newOrder = [...participantKeys, ...rest];
    setOrder(newOrder);
    localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(newOrder));
    setContextMenu(null);
  }

  function setTileScale(tileKey: string, scale: TileScale | null) {
    setScaleOverrides(prev => {
      const next = { ...prev };
      if (scale === null) delete next[tileKey]; else next[tileKey] = scale;
      localStorage.setItem(TILE_SCALE_KEY, JSON.stringify(next));
      return next;
    });
    setContextMenu(null);
  }

  const contextMenuParticipant = contextMenu
    ? tracks.find(t => t.participant.sid === contextMenu.sid)?.participant ?? null
    : null;

  // Game mode tiles use a fixed pixel height (small/medium/large) with a 16:9
  // tile width. The window itself is sized to fit by GameModeAutoSize in MainPage.
  const tileH = GAME_SIZES[gameSize];
  const tileW = Math.round((tileH * 16) / 9);

  return (
    <>
      <div
        className={`video-grid${gameMode ? ' game-mode-grid' : ''}`}
        style={!gameMode ? {
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows:    `repeat(${rows}, 1fr)`,
        } : { ['--game-tile-h' as never]: `${tileH}px`, ['--game-tile-w' as never]: `${tileW}px` }}
      >
        {visibleTracks.map(track => {
          const tileSid = `${track.participant.sid}-${track.source}`;
          const isLocalCamera = track.participant.isLocal && track.source === Track.Source.Camera;
          const isMuted = locallyMuted.has(track.participant.sid);
          const isDragOver = dragOverSid === tileSid;
          const scale = scaleOverrides[tileSid];

          return (
            <div
              key={tileSid}
              className={[
                'tile-wrapper',
                isLocalCamera ? 'local-camera-tile' : '',
                isDragOver ? 'drag-over' : '',
                scale ? `scale-${scale}` : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={() => handleDragStart(tileSid)}
              onDragOver={e => handleDragOver(e, tileSid)}
              onDrop={() => handleDrop(tileSid)}
              onDragEnd={handleDragEnd}
              onContextMenu={e => handleContextMenu(e, track.participant.sid, tileSid, String(track.source))}
            >
              <ParticipantTile trackRef={track} />
              {isMuted && (
                <div className="tile-muted-badge">🔇 muted locally</div>
              )}
            </div>
          );
        })}

        {statsVisible && !gameMode && <StatsTile />}
      </div>

      {contextMenu && (() => {
        const isScreen = contextMenu.source === Track.Source.ScreenShare;
        const currentScale = scaleOverrides[contextMenu.tileKey];
        return (
          <div
            className="tile-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            {contextMenuParticipant && !contextMenuParticipant.isLocal && !isScreen && (
              <button onClick={() => handleMuteLocally(contextMenu.sid)}>
                {locallyMuted.has(contextMenu.sid) ? '🔊 Unmute for me' : '🔇 Mute for me'}
              </button>
            )}
            {!gameMode && (
              <button onClick={() => handlePinToTop(contextMenu.sid)}>
                📌 Pin to top
              </button>
            )}
            <div className="context-divider" />
            <div className="context-section-label">Scale</div>
            <button
              className={currentScale === 'contain' || (!currentScale && isScreen) ? 'active' : ''}
              onClick={() => setTileScale(contextMenu.tileKey, 'contain')}
            >
              ⛶ Fit (no crop)
            </button>
            <button
              className={currentScale === 'cover' || (!currentScale && !isScreen) ? 'active' : ''}
              onClick={() => setTileScale(contextMenu.tileKey, 'cover')}
            >
              ▦ Fill (crop edges)
            </button>
            {currentScale && (
              <button onClick={() => setTileScale(contextMenu.tileKey, null)}>
                ↺ Reset to default
              </button>
            )}
          </div>
        );
      })()}
    </>
  );
}
