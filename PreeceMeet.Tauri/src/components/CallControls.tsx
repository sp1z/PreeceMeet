interface Props {
  connected:    boolean;
  micMuted:     boolean;
  camMuted:     boolean;
  onToggleMic:  () => void;
  onToggleCam:  () => void;
  onHangup:     () => void;
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
        {micMuted ? '🔇' : '🎤'}
      </button>
      <button
        className={`control-btn${camMuted ? ' muted' : ''}`}
        onClick={onToggleCam}
        disabled={!connected}
        title={camMuted ? 'Start camera' : 'Stop camera'}
      >
        {camMuted ? '📷' : '📹'}
      </button>
      <button
        className="control-btn hangup"
        onClick={onHangup}
        disabled={!connected}
        title="Leave call"
      >
        📵
      </button>
    </div>
  );
}
