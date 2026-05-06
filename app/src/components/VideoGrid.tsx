import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTracks, ParticipantTile, useRoomContext } from '@livekit/components-react';
import { Track, RemoteTrackPublication, RoomEvent, RemoteParticipant } from 'livekit-client';
import { createLogger } from '../logger';

const TILE_ORDER_KEY  = 'preecemeet_tile_order';
const TILE_SCALE_KEY  = 'preecemeet_tile_scale';
const TILE_VOLUME_KEY = 'preecemeet_tile_volume';

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
  showSpeakingIndicator?: boolean;
  /** Local-only MediaStream to render as an extra tile (PassThru). Never
   *  published to LiveKit. `null` means no PassThru active. */
  passThruStream?:  MediaStream | null;
  onStopPassThru?:  () => void;
  /** Called when a remote sends a "please-mute" data message. The host
   *  should flip its micMuted state so the mic-button UI reflects reality
   *  and the user can unmute with a single click. */
  onForceMicMute?:  (sourceName: string) => void;
}

export default function VideoGrid({ gameMode, gameSize = 'medium', showSelf = false, showSpeakingIndicator = true, passThruStream = null, onStopPassThru, onForceMicMute }: Props) {
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

  // Per-participant playback volume (0.0–1.0). Persisted by participant
  // *identity* (email) so it survives reconnects and carries across rooms.
  // Absence = default (1.0).
  //
  // Why the clamp on read: HTMLMediaElement.volume only accepts [0, 1] —
  // anything outside throws IndexSizeError synchronously inside attach()
  // and tears down the room mount. v1.6.11 and earlier let the slider go
  // to 1.5; any persisted >1 value would brick joins for that user. We
  // self-heal those entries on load and write the cleaned map back.
  const [volumeOverrides, setVolumeOverrides] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(TILE_VOLUME_KEY);
      const parsed = raw ? JSON.parse(raw) as Record<string, number> : {};
      let dirty = false;
      for (const id of Object.keys(parsed)) {
        const clamped = Math.min(Math.max(parsed[id], 0), 1);
        if (clamped !== parsed[id]) { parsed[id] = clamped; dirty = true; }
      }
      if (dirty) localStorage.setItem(TILE_VOLUME_KEY, JSON.stringify(parsed));
      return parsed;
    } catch { return {}; }
  });

  const [locallyMuted, setLocallyMuted] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ sid: string; identity: string; tileKey: string; scaleKey: string; source: string; x: number; y: number } | null>(null);
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

  // Apply persisted per-participant volume overrides to remote participants.
  // Re-runs whenever the track set changes (new joiner, resubscribe) or the
  // override map mutates. Identity is stable across reconnects/rooms, so the
  // same volume follows a person everywhere.
  useEffect(() => {
    room.remoteParticipants.forEach(p => {
      const v = volumeOverrides[p.identity];
      const safe = typeof v === 'number' ? Math.min(Math.max(v, 0), 1) : 1;
      (p as RemoteParticipant).setVolume(safe);
    });
  }, [tracks, volumeOverrides, room]);

  // Clear the focus when the focused participant leaves / tile key changes.
  // The synthetic `passthru` key stays valid as long as a passthru stream
  // is active — cleared when the stream goes away.
  useEffect(() => {
    if (!focusKey) return;
    if (focusKey === 'passthru') {
      if (!passThruStream) setFocusKey(null);
      return;
    }
    const stillThere = tracks.some(t => `${t.participant.sid}-${t.source}` === focusKey);
    if (!stillThere) setFocusKey(null);
  }, [focusKey, tracks, passThruStream]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // After the menu renders, measure it and shift into the viewport if the
  // raw mouse-click coords would push any edge off-screen. Important in
  // game mode where the window can be 300px tall and a right-click near
  // the bottom/right would otherwise clip the menu.
  const menuRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 6;
    let left = contextMenu.x;
    let top  = contextMenu.y;
    if (left + rect.width  + pad > window.innerWidth)  left = window.innerWidth  - rect.width  - pad;
    if (top  + rect.height + pad > window.innerHeight) top  = window.innerHeight - rect.height - pad;
    left = Math.max(pad, left);
    top  = Math.max(pad, top);
    if (left !== contextMenu.x || top !== contextMenu.y) {
      setContextMenu(prev => prev ? { ...prev, x: left, y: top } : prev);
    }
  }, [contextMenu]);

  // Defensive filter against phantom / zombie tiles. We've observed (see
  // 2026-04-20 incident logs) cases where a remote participant's disconnect
  // event arrives without a preceding connect, or where a crash-looping
  // peer leaves multiple sids alive for the same identity. `useTracks` will
  // happily render placeholder tiles for both, producing a "blank screen"
  // the user can't interact with. We re-derive the live sid set from
  // `room.remoteParticipants`, then for each identity prefer the
  // most-recently-joined sid and drop the rest.
  const liveSids = new Set<string>([room.localParticipant.sid]);
  const newestByIdentity = new Map<string, { sid: string; joinedAt: number }>();
  room.remoteParticipants.forEach(p => {
    liveSids.add(p.sid);
    const joinedAt = (p as RemoteParticipant).joinedAt?.getTime?.() ?? 0;
    const prev = newestByIdentity.get(p.identity);
    if (!prev || joinedAt > prev.joinedAt) {
      newestByIdentity.set(p.identity, { sid: p.sid, joinedAt });
    }
  });
  const supplantedSids = new Set<string>();
  room.remoteParticipants.forEach(p => {
    const winner = newestByIdentity.get(p.identity);
    if (winner && winner.sid !== p.sid) supplantedSids.add(p.sid);
  });

  // Warn once per unique zombie-set so the upload pipeline doesn't get
  // flooded on every render — the filter result above runs on every render
  // but the log line should fire only when the set changes.
  const warnedZombieKeyRef = useRef<string>('');
  useEffect(() => {
    const key = [...supplantedSids].sort().join(',');
    if (key && key !== warnedZombieKeyRef.current) {
      warnedZombieKeyRef.current = key;
      vgLog.warn('suppressing zombie participant tiles', {
        count: supplantedSids.size,
        sids:  [...supplantedSids],
      });
    } else if (!key) {
      warnedZombieKeyRef.current = '';
    }
  });

  const liveTracks = tracks.filter(t => {
    if (t.participant.isLocal) return true;
    const sid = t.participant.sid;
    if (!liveSids.has(sid)) return false;
    if (supplantedSids.has(sid)) return false;
    return true;
  });

  const sortedTracks = [...liveTracks].sort((a, b) => {
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

  // Local camera tile is rendered-but-hidden when showSelf is off (in any
  // mode). Same reason as before: unmounting the local ParticipantTile races
  // the v4l2 capture handoff on Linux and leaves the local track black.
  function isHiddenInGame(track: typeof visibleTracks[number]): boolean {
    if (!showSelf && track.participant.isLocal && track.source === Track.Source.Camera) return true;
    return false;
  }

  const passThruVisible = !!passThruStream && !gameMode;
  const PASSTHRU_KEY = 'passthru';
  const renderedCount = visibleTracks.filter(t => !isHiddenInGame(t)).length + (passThruVisible ? 1 : 0);
  const count = renderedCount;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  // Focus mode is a separate layout, not a grid variant: one big primary tile
  // on top, everything else as a horizontal thumbnail strip underneath. Game
  // mode overrides focus (game-mode is a mutually-exclusive layout). PassThru
  // participates in focus via the synthetic `passthru` tile key.
  const focusOnPassThru = !gameMode && focusKey === PASSTHRU_KEY && passThruVisible;
  const focusOnTrack    = !gameMode && !!focusKey && focusKey !== PASSTHRU_KEY
    && visibleTracks.some(t => `${t.participant.sid}-${t.source}` === focusKey);
  const focusActive = focusOnTrack || focusOnPassThru;

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

  function handleContextMenu(e: React.MouseEvent, sid: string, identity: string, tileKey: string, scaleKey: string, source: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ sid, identity, tileKey, scaleKey, source, x: e.clientX, y: e.clientY });
  }

  function setParticipantVolume(identity: string, volume: number | null) {
    setVolumeOverrides(prev => {
      const next = { ...prev };
      if (volume === null) delete next[identity];
      else next[identity] = Math.min(Math.max(volume, 0), 1);
      localStorage.setItem(TILE_VOLUME_KEY, JSON.stringify(next));
      return next;
    });
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
        onContextMenu={e => handleContextMenu(e, track.participant.sid, track.participant.identity, tileSid, scaleKey, String(track.source))}
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
      {focusActive ? (
        <div className={`video-focus-layout${!showSpeakingIndicator ? ' hide-speaking' : ''}`}>
          <div className="focus-main">
            {focusOnPassThru
              ? <PassThruTile
                  stream={passThruStream!}
                  variant="focus-main"
                  scale={scaleOverrides[PASSTHRU_KEY] ?? null}
                  onStop={onStopPassThru}
                  onContextMenu={e => handleContextMenu(e, '', PASSTHRU_KEY, PASSTHRU_KEY, PASSTHRU_KEY, 'passthru')}
                  onDoubleClick={() => handleFocus(PASSTHRU_KEY)}
                />
              : focusedTrack && renderTile(focusedTrack, 'focus-main')}
          </div>
          {(thumbTracks.length > 0 || (passThruVisible && !focusOnPassThru)) && (
            <div className="focus-strip">
              {thumbTracks.map(t => renderTile(t, 'focus-thumb'))}
              {passThruVisible && !focusOnPassThru && (
                <PassThruTile
                  stream={passThruStream!}
                  variant="focus-thumb"
                  scale={scaleOverrides[PASSTHRU_KEY] ?? null}
                  onStop={onStopPassThru}
                  onContextMenu={e => handleContextMenu(e, '', PASSTHRU_KEY, PASSTHRU_KEY, PASSTHRU_KEY, 'passthru')}
                  onDoubleClick={() => handleFocus(PASSTHRU_KEY)}
                />
              )}
            </div>
          )}
        </div>
      ) : (
      <div
        className={`video-grid${gameMode ? ' game-mode-grid' : ''}${!showSpeakingIndicator ? ' hide-speaking' : ''}`}
        style={!gameMode ? {
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows:    `repeat(${rows}, 1fr)`,
        } : { ['--game-tile-h' as never]: `${tileH}px`, ['--game-tile-w' as never]: `${tileW}px` }}
      >
        {visibleTracks.map(track => renderTile(track, 'grid'))}
        {passThruVisible && (
          <PassThruTile
            stream={passThruStream!}
            variant="grid"
            scale={scaleOverrides[PASSTHRU_KEY] ?? null}
            onStop={onStopPassThru}
            onContextMenu={e => handleContextMenu(e, '', PASSTHRU_KEY, PASSTHRU_KEY, PASSTHRU_KEY, 'passthru')}
            onDoubleClick={() => handleFocus(PASSTHRU_KEY)}
          />
        )}
      </div>
      )}

      {muteRequestToast && (
        <div className="toast-notice">{muteRequestToast}</div>
      )}

      {contextMenu && (() => {
        const isScreen   = contextMenu.source === Track.Source.ScreenShare;
        const isPassThru = contextMenu.tileKey === PASSTHRU_KEY;
        // PassThru defaults to Fit (same as a screen share) — it's usually
        // a window capture where cropping the edges would lose detail.
        const defaultContain = isScreen || isPassThru;
        const currentScale = scaleOverrides[contextMenu.scaleKey];
        return (
          <div
            ref={menuRef}
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
                <div className="context-divider" />
                <div className="context-section-label">
                  Volume for me — {Math.round(((volumeOverrides[contextMenu.identity] ?? 1)) * 100)}%
                </div>
                <div className="context-volume-row">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volumeOverrides[contextMenu.identity] ?? 1}
                    onChange={e => setParticipantVolume(contextMenu.identity, parseFloat(e.target.value))}
                  />
                </div>
                {contextMenu.identity in volumeOverrides && (
                  <button onClick={() => setParticipantVolume(contextMenu.identity, null)}>
                    ↺ Reset volume
                  </button>
                )}
              </>
            )}
            {!gameMode && !isPassThru && (
              <button onClick={() => handlePinToTop(contextMenu.sid)}>
                📌 Pin to top
              </button>
            )}
            <div className="context-divider" />
            <div className="context-section-label">Scale</div>
            <button
              className={currentScale === 'contain' || (!currentScale && defaultContain) ? 'active' : ''}
              onClick={() => setTileScale(contextMenu.scaleKey, 'contain')}
            >
              ⛶ Fit (no crop)
            </button>
            <button
              className={currentScale === 'cover' || (!currentScale && !defaultContain) ? 'active' : ''}
              onClick={() => setTileScale(contextMenu.scaleKey, 'cover')}
            >
              ▦ Fill (crop edges)
            </button>
            {currentScale && (
              <button onClick={() => setTileScale(contextMenu.scaleKey, null)}>
                ↺ Reset to default
              </button>
            )}
            {isPassThru && onStopPassThru && (
              <>
                <div className="context-divider" />
                <button onClick={() => { setContextMenu(null); onStopPassThru(); }}>
                  ✕ Stop PassThru
                </button>
              </>
            )}
          </div>
        );
      })()}
    </>
  );
}

// ── PassThru tile ──────────────────────────────────────────────────────────
// Renders a local-only MediaStream as an additional tile. Never wired to
// LiveKit — it exists purely in this client's DOM.

interface PassThruTileProps {
  stream:         MediaStream;
  variant:        'grid' | 'focus-main' | 'focus-thumb';
  scale:          TileScale | null;
  onStop?:        () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

function PassThruTile({ stream, variant, scale, onStop, onContextMenu, onDoubleClick }: PassThruTileProps) {
  // Ref callback rather than useRef + useEffect: when React reparents the
  // tile (grid → focus-main), the <video> gets unmounted and a fresh one
  // mounted. A callback ref fires synchronously on that new element, so
  // the stream is attached before the browser paints the first frame —
  // no black flash.
  const attachVideo = (el: HTMLVideoElement | null) => {
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (el.paused) void el.play().catch(() => { /* autoplay-muted denied is fine */ });
  };

  // Default to `contain` (like screen share) unless the user picked `cover`.
  const effectiveScale: TileScale = scale ?? 'contain';

  return (
    <div
      className={[
        'tile-wrapper',
        'passthru-tile',
        variant === 'focus-main'  ? 'focus-main-tile'  : '',
        variant === 'focus-thumb' ? 'focus-thumb-tile' : '',
        `scale-${effectiveScale}`,
      ].filter(Boolean).join(' ')}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <video ref={attachVideo} autoPlay playsInline muted className="passthru-video" />
      <div className="passthru-label">PassThru (local only)</div>
      {onStop && (
        <button
          type="button"
          className="passthru-stop"
          onClick={onStop}
          title="Stop PassThru"
        >
          ✕
        </button>
      )}
    </div>
  );
}
