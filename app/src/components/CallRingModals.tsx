import { useEffect } from 'react';
import type { IncomingCall, OutgoingCall } from '../calling';
import { formatUser } from '../format';
import { PhoneAcceptIcon, PhoneDeclineIcon } from './icons';

interface IncomingProps {
  call:    IncomingCall;
  onAccept:  () => void;
  onDecline: () => void;
}

function initialsEmoji(name: string): string {
  const n = (name || '').trim();
  if (!n) return '🙂';
  // Very simple hash-to-emoji so different callers get visually different avatars
  const set = ['🙂', '😀', '😎', '🤠', '🦊', '🐼', '🐻', '🐨', '🐯', '🐰', '🐸', '🦉'];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
  return set[Math.abs(h) % set.length];
}

export function IncomingCallModal({ call, onAccept, onDecline }: IncomingProps) {
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

  const displayName = formatUser(call.from, call.fromDisplayName);
  const shownEmail  = call.fromDisplayName && call.from !== call.fromDisplayName ? call.from : '';

  return (
    <div className="ring-backdrop">
      <div className="ring-card">
        <div className="ring-kicker mono">INCOMING · DIRECT CALL</div>

        <div className="ring-avatar-wrap">
          <span className="ring-ripple" aria-hidden />
          <span className="ring-ripple ring-ripple-2" aria-hidden />
          <div className="ring-avatar emoji">{initialsEmoji(displayName)}</div>
        </div>

        <div className="ring-name">{displayName}</div>
        <div className="ring-sub mono">
          {shownEmail ? shownEmail : 'calling you…'}
        </div>

        <div className="ring-actions">
          <div className="ring-action">
            <button
              type="button"
              className="ring-btn ring-btn-decline"
              onClick={onDecline}
              aria-label="Decline call"
            >
              <PhoneDeclineIcon size={26} />
            </button>
            <span className="ring-action-label">Decline</span>
          </div>
          <div className="ring-action">
            <button
              type="button"
              className="ring-btn ring-btn-accept"
              onClick={onAccept}
              aria-label="Accept call"
            >
              <PhoneAcceptIcon size={26} />
            </button>
            <span className="ring-action-label">Accept</span>
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
  const displayName = formatUser(call.to);
  return (
    <div className="ring-backdrop">
      <div className="ring-card">
        <div className="ring-kicker mono">CALLING…</div>

        <div className="ring-avatar-wrap">
          <span className="ring-spin" aria-hidden />
          <div className="ring-avatar emoji">{initialsEmoji(displayName)}</div>
        </div>

        <div className="ring-name">{displayName}</div>
        <div className="ring-sub mono">waiting for answer…</div>

        <div className="ring-actions single">
          <div className="ring-action">
            <button
              type="button"
              className="ring-btn ring-btn-decline"
              onClick={onCancel}
              aria-label="Cancel call"
            >
              <PhoneDeclineIcon size={26} />
            </button>
            <span className="ring-action-label">Cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
