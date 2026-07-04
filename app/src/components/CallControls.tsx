// Floating call-control pill — comp 1b/1c.
// Absolute bottom-center over the video grid. Hangup is visually separated
// (via extra gap + red styling) so it never gets muscle-memory-clicked.

import {
  MicIcon,
  MicOffIcon,
  CamIcon,
  CamOffIcon,
  ScreenShareIcon,
  PassThruIcon,
  SelfIcon,
  HangupIcon,
} from './icons';

// Preserve the previous named exports so consumers (game-mode titlebar, etc.)
// keep working.
export { MicIcon, MicOffIcon, CamIcon, CamOffIcon } from './icons';

interface Props {
  connected:           boolean;
  micMuted:            boolean;
  camMuted:            boolean;
  screenSharing:       boolean;
  screenShareDisabled: boolean;
  passThruActive:      boolean;
  showSelf:            boolean;
  onToggleMic:         () => void;
  onToggleCam:         () => void;
  onToggleScreenShare: () => void;
  onTogglePassThru:    () => void;
  onToggleSelf:        () => void;
  onHangup:            () => void;
}

export default function CallControls({
  connected,
  micMuted,
  camMuted,
  screenSharing,
  screenShareDisabled,
  passThruActive,
  showSelf,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onTogglePassThru,
  onToggleSelf,
  onHangup,
}: Props) {
  const shareDisabled = !connected || (screenShareDisabled && !screenSharing);
  const shareTitle = screenSharing
    ? 'Stop sharing'
    : screenShareDisabled
      ? 'Someone else is sharing'
      : 'Share screen or window';

  return (
    <div className="call-pill" role="toolbar" aria-label="Call controls">
      <button
        className={`pill-btn${micMuted ? ' muted' : ''}`}
        onClick={onToggleMic}
        disabled={!connected}
        title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {micMuted ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button
        className={`pill-btn${camMuted ? ' muted' : ''}`}
        onClick={onToggleCam}
        disabled={!connected}
        title={camMuted ? 'Start camera' : 'Stop camera'}
        aria-label={camMuted ? 'Start camera' : 'Stop camera'}
      >
        {camMuted ? <CamOffIcon /> : <CamIcon />}
      </button>
      <button
        className={`pill-btn${screenSharing ? ' active' : ''}`}
        onClick={onToggleScreenShare}
        disabled={shareDisabled}
        title={shareTitle}
        aria-label={shareTitle}
      >
        <ScreenShareIcon />
      </button>
      <button
        className={`pill-btn passthru${passThruActive ? ' active' : ''}`}
        onClick={onTogglePassThru}
        disabled={!connected}
        title={passThruActive ? 'Stop PassThru — was showing you a local window/screen' : 'PassThru — show a window or screen only to you (not broadcast)'}
        aria-label="Toggle PassThru"
      >
        <PassThruIcon />
      </button>
      <button
        className={`pill-btn${showSelf ? ' active' : ''}`}
        onClick={onToggleSelf}
        disabled={!connected}
        title={showSelf ? 'Hide self preview' : 'Show self preview'}
        aria-label="Toggle self preview"
      >
        <SelfIcon size={18} />
      </button>
      <span className="pill-sep" aria-hidden />
      <button
        className="pill-btn hangup"
        onClick={onHangup}
        disabled={!connected}
        title="Leave call"
        aria-label="Leave call"
      >
        <HangupIcon />
      </button>
    </div>
  );
}
