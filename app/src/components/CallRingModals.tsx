import { useEffect } from 'react';
import type { IncomingCall, OutgoingCall } from '../calling';
import { formatUser } from '../format';

interface IncomingProps {
  call:    IncomingCall;
  onAccept:  () => void;
  onDecline: () => void;
}

export function IncomingCallModal({ call, onAccept, onDecline }: IncomingProps) {
  // Best-effort ring sound — synthesised with WebAudio so we don't ship an asset.
  useEffect(() => {
    let stopped = false;
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);

    function beep() {
      if (stopped) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 660;
      osc2.connect(gain);
      osc2.start(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.9);
    }
    beep();
    const t = setInterval(beep, 2000);
    return () => { stopped = true; clearInterval(t); ctx.close().catch(() => { /* ignore */ }); };
  }, []);

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal-box call-ring-modal">
        <div className="modal-body" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Incoming call</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{formatUser(call.from, call.fromDisplayName)}</div>
          {call.fromDisplayName && call.from !== call.fromDisplayName && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>{call.from}</div>
          )}
          {!call.fromDisplayName && <div style={{ marginBottom: 20 }} />}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              className="btn"
              onClick={onDecline}
              style={{ background: '#ef5350', color: '#fff', minWidth: 110 }}
            >
              Decline
            </button>
            <button
              className="btn btn-primary"
              onClick={onAccept}
              style={{ background: '#34d399', color: '#0a0a14', minWidth: 110 }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OutgoingProps {
  call:     OutgoingCall;
  onCancel: () => void;
}

export function OutgoingCallModal({ call, onCancel }: OutgoingProps) {
  return (
    <div className="modal-backdrop" style={{ zIndex: 9998 }}>
      <div className="modal-box call-ring-modal">
        <div className="modal-body" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Calling…</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>{formatUser(call.to)}</div>
          <div className="spinner" style={{ margin: '0 auto 24px' }} />
          <button className="btn" onClick={onCancel} style={{ background: '#ef5350', color: '#fff', minWidth: 140 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
