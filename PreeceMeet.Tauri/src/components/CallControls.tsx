interface Props {
  connected:   boolean;
  micMuted:    boolean;
  camMuted:    boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onHangup:    () => void;
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>
  );
}

function CamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/>
      <path d="M10.68 6.34A2 2 0 0 1 12 6a2 2 0 0 1 2 2v.34"/>
      <polygon points="23 7 16 12 23 17 23 7"/>
    </svg>
  );
}

function HangupIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.46 9a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.36 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.3 8.91"/>
      <line x1="23" y1="1" x2="1" y2="23"/>
    </svg>
  );
}

export default function CallControls({ connected, micMuted, camMuted, onToggleMic, onToggleCam, onHangup }: Props) {
  return (
    <div className="call-controls">
      <button
        className={`control-btn${micMuted ? ' muted' : ''}`}
        onClick={onToggleMic}
        disabled={!connected}
        title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {micMuted ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button
        className={`control-btn${camMuted ? ' muted' : ''}`}
        onClick={onToggleCam}
        disabled={!connected}
        title={camMuted ? 'Start camera' : 'Stop camera'}
      >
        {camMuted ? <CamOffIcon /> : <CamIcon />}
      </button>
      <button
        className="control-btn hangup"
        onClick={onHangup}
        disabled={!connected}
        title="Leave call"
      >
        <HangupIcon />
      </button>
    </div>
  );
}
