import { useState, useEffect } from 'react';
import { useTracks, ParticipantTile, useRoomContext } from '@livekit/components-react';
import { Track, RemoteTrackPublication, RoomEvent } from 'livekit-client';
import { createLogger } from '../logger';

const TILE_ORDER_KEY = 'preecemeet_tile_order';
const TILE_SCALE_KEY = 'preecemeet_tile_scale';

const MODERATION_TOPIC = 'moderation';
const vgLog = createLogger('videogrid');

export type GameSize = 'small' | 'medium' | 'large';
export type TileScale = 'cover' | 'contain';

export const GAME_SIZES: Record<GameSize, number> = {
  small:  150,
  medium: 200,
  large:  300,
};

interface Props {
  gameMode?:        boolean;
  gameSize?:        GameSize;
  showSelf?:        boolean;
  /** Called when a remote sends a "please-mute" data message. The host
   *  should flip its micMuted state so the mic-button UI reflects reality
   *  and the user can unmute with a single click. */
  onForceMicMute?:  (sourceName: string) => void;
}

export default function VideoGrid({ gameMode, gameSize = 'medium', showSelf = false, onForceMicMute }: Props) {
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

  // Per-tile scale override (cover|contain). Persisted by participant
  // *identity* + source so it survives reconnects (sid is regenerated on
  // every reconnect). Default falls through to CSS: camera = cover,
  // screen_share = contain.
  const [scaleOverrides, setScaleOverrides] = useState<Record<string, TileScale>>(() => {
    try {
      const raw = localStorage.getItem(TILE_SCALE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [locallyMuted, setLocallyMuted] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ sid: string; tileKey: string; scaleKey: string; source: string; x: number; y: number } | null>(null);
  const [dragSid, setDragSid] = useState<string | null>(null);
  const [dragOverSid, setDragOverSid] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [muteRequestToast, setMuteRequestToast] = useState<string | null>(null);

  // Listen for "please mute" data messages from other clients. When one
  // arrives, mute our microphone locally (honouring the soft moderation
  // request) and surface a toast so the user knows who asked. The initiator
  // gets their own echo filtered out by the participant.isLocal check.
  useEffect(() => {
    const handler = (payload: Uint8Array, participant: { identity?: string; name?: string; isLocal?: boolean } | undefined, _kind: unknown, topic?: string) => {
      if (topic !== MODERATION_TOPIC || participant?.isLocal) return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg?.type !== 'please-mute-mic') return;
        const asker = msg.fromName || participant?.name || participant?.identity || 'someone';
        // Hand off to the host so it can flip its micMuted state — the host's
        // existing useEffect will then call setMicrophoneEnabled(false). This
        // keeps the mic-button UI in sync so the user can unmute in one click.
        if (onForceMicMute) {
          onForceMicMute(asker);
        } else {
          // Fallback if no host callback wired (shouldn't happen).
          void room.localParticipant.setMicrophoneEnabled(false);
        }
        vgLog.info('honoring remote mute request', { from: asker });
        setMuteRequestToast(`${asker} muted you.`);
        setTimeout(() => setMuteRequestToast(null), 4000);
      } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room]);

  // Clear the focus when the focused participant leaves / tile key changes.
  useEffect(() => {
    if (!focusKey) return;
    const stillThere = tracks.some(t => `${t.participant.sid}-${t.source}` === focusKey);
    if (!stillThere) setFocusKey(null);
  }, [focusKey, tracks]);

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
  //
  // Local-camera-in-game-mode is rendered-but-hidden rather than filtered out,
  // because unmounting the local ParticipantTile on every toggle races the
  // v4l2 capture handoff on Linux and leaves the local track black until the
  // user toggles the camera manually. Keeping it mounted avoids that.
  const visibleTracks = gameMode
    ? sortedTracks.filter(t => t.source !== Track.Source.ScreenShare)
    : sortedTracks;

  function isHiddenInGame(track: typeof visibleTracks[number]): boolean {
    return !!gameMode && !showSelf && track.participant.isLocal;
  }

  const renderedCount = visibleTracks.filter(t => !isHiddenInGame(t)).length;
  const count = renderedCount;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  // Focus mode is a separate layout, not a grid variant: one big primary tile
  // on top, everything else as a horizontal thumbnail strip underneath. Game
  // mode overrides focus (game-mode is a mutually-exclusive layout).
  const focusActive = !gameMode && !!focusKey && visibleTracks.some(t => `${t.participant.sid}-${t.source}` === focusKey);

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

  function handleContextMenu(e: React.MouseEvent, sid: string, tileKey: string, scaleKey: string, source: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ sid, tileKey, scaleKey, source, x: e.clientX, y: e.clientY });
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

  function handleFocus(tileKey: string) {
    setFocusKey(prev => prev === tileKey ? null : tileKey);
    vgLog.info('focus toggled', { tileKey });
    setContextMenu(null);
  }

  // Send a "please-mute" data message to a specific participant. Receivers
  // mute themselves (soft moderation — not enforced by LiveKit, but works
  // fine for a trusted group meeting app).
  function handleMuteForAll(sid: string) {
    const target = [...room.remoteParticipants.values()].find(p => p.sid === sid);
    if (!target) { setContextMenu(null); return; }
    const msg = {
      type:     'please-mute-mic',
      fromName: room.localParticipant.name || room.localParticipant.identity,
      targetSid: sid,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(msg));
    void room.localParticipant.publishData(bytes, {
      reliable:          true,
      topic:             MODERATION_TOPIC,
      destinationIdentities: [target.identity],
    });
    vgLog.info('sent mute-for-all', { target: target.identity });
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

  // Reusable tile renderer — used in both grid and focus layouts, and for
  // thumbnails. `variant` distinguishes the focused-big tile from the strip.
  function renderTile(track: typeof visibleTracks[number], variant: 'grid' | 'focus-main' | 'focus-thumb') {
    const tileSid  = `${track.participant.sid}-${track.source}`;
    const scaleKey = `${track.participant.identity}-${track.source}`;
    const isLocalCamera = track.participant.isLocal && track.source === Track.Source.Camera;
    const isMuted = locallyMuted.has(track.participant.sid);
    const isDragOver = dragOverSid === tileSid;
    const scale = scaleOverrides[scaleKey];
    const hiddenInGame = isHiddenInGame(track);

    return (
      <div
        key={tileSid}
        className={[
          'tile-wrapper',
          variant === 'focus-main'  ? 'focus-main-tile' : '',
          variant === 'focus-thumb' ? 'focus-thumb-tile' : '',
          isLocalCamera ? 'local-camera-tile' : '',
          isDragOver ? 'drag-over' : '',
          scale ? `scale-${scale}` : '',
          hiddenInGame ? 'game-hidden' : '',
        ].filter(Boolean).join(' ')}
        draggable={variant !== 'focus-main'}
        onDragStart={() => handleDragStart(tileSid)}
        onDragOver={e => handleDragOver(e, tileSid)}
        onDrop={() => handleDrop(tileSid)}
        onDragEnd={handleDragEnd}
        onContextMenu={e => handleContextMenu(e, track.participant.sid, tileSid, scaleKey, String(track.source))}
        onDoubleClick={() => !gameMode && handleFocus(tileSid)}
      >
        <ParticipantTile trackRef={track} />
        {isMuted && (
          <div className="tile-muted-badge">🔇 muted locally</div>
        )}
      </div>
    );
  }

  const focusedTrack = focusActive ? visibleTracks.find(t => `${t.participant.sid}-${t.source}` === focusKey) : null;
  const thumbTracks  = focusActive ? visibleTracks.filter(t => `${t.participant.sid}-${t.source}` !== focusKey) : [];

  return (
    <>
      {focusActive && focusedTrack ? (
        <div className="video-focus-layout">
          <div className="focus-main">
            {renderTile(focusedTrack, 'focus-main')}
          </div>
          {thumbTracks.length > 0 && (
            <div className="focus-strip">
              {thumbTracks.map(t => renderTile(t, 'focus-thumb'))}
            </div>
          )}
        </div>
      ) : (
      <div
        className={`video-grid${gameMode ? ' game-mode-grid' : ''}`}
        style={!gameMode ? {
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows:    `repeat(${rows}, 1fr)`,
        } : { ['--game-tile-h' as never]: `${tileH}px`, ['--game-tile-w' as never]: `${tileW}px` }}
      >
        {visibleTracks.map(track => renderTile(track, 'grid'))}
      </div>
      )}

      {muteRequestToast && (
        <div className="toast-notice">{muteRequestToast}</div>
      )}

      {contextMenu && (() => {
        const isScreen = contextMenu.source === Track.Source.ScreenShare;
        const currentScale = scaleOverrides[contextMenu.scaleKey];
        return (
          <div
            className="tile-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            {!gameMode && (
              <button onClick={() => handleFocus(contextMenu.tileKey)}>
                {focusKey === contextMenu.tileKey ? '⊟ Exit focus' : '⊞ Focus this tile'}
              </button>
            )}
            {contextMenuParticipant && !contextMenuParticipant.isLocal && (
              <>
                <button onClick={() => handleMuteLocally(contextMenu.sid)}>
                  {locallyMuted.has(contextMenu.sid) ? '🔊 Unmute audio for me' : '🔇 Mute audio for me'}
                </button>
                {!isScreen && (
                  <button onClick={() => handleMuteForAll(contextMenu.sid)}>
                    🛑 Mute mic for all
                  </button>
                )}
              </>
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
              onClick={() => setTileScale(contextMenu.scaleKey, 'contain')}
            >
              ⛶ Fit (no crop)
            </button>
            <button
              className={currentScale === 'cover' || (!currentScale && !isScreen) ? 'active' : ''}
              onClick={() => setTileScale(contextMenu.scaleKey, 'cover')}
            >
              ▦ Fill (crop edges)
            </button>
            {currentScale && (
              <button onClick={() => setTileScale(contextMenu.scaleKey, null)}>
                ↺ Reset to default
              </button>
            )}
          </div>
        );
      })()}
    </>
  );
}
