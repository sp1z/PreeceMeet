import { useEffect, useState } from 'react';
import { PreeceMeetMark } from './Mark';

// Brand-styled "Connecting…" panel. Replaces the generic spinner overlay.
//
// Visible while:
//   - LiveKit is still establishing the session, OR
//   - the local camera track hasn't published yet (so we don't flash the
//     placeholder avatar tiles before real video arrives), OR
//   - the 2-second visual minimum hasn't elapsed (avoids a one-frame flash
//     when the join completes really quickly).
//
// The host (MainPage) computes `videoReady` and passes it in. The 2-second
// floor is enforced inside this component so callers don't have to think
// about timing.

const MIN_VISIBLE_MS = 2000;

interface Props {
  /** Show only while this is true. */
  visible:    boolean;
  /** Optional sub-label override; default is "Joining the meeting". */
  subLabel?:  string;
}

export default function ConnectingPanel({ visible, subLabel }: Props) {
  const [shownAt, setShownAt]     = useState<number | null>(null);
  const [floorMet, setFloorMet]   = useState(false);

  useEffect(() => {
    if (visible && shownAt === null) {
      setShownAt(Date.now());
      setFloorMet(false);
    }
    if (!visible) {
      setShownAt(null);
      setFloorMet(false);
    }
  }, [visible, shownAt]);

  useEffect(() => {
    if (shownAt === null) return;
    const elapsed = Date.now() - shownAt;
    if (elapsed >= MIN_VISIBLE_MS) { setFloorMet(true); return; }
    const t = setTimeout(() => setFloorMet(true), MIN_VISIBLE_MS - elapsed);
    return () => clearTimeout(t);
  }, [shownAt]);

  // Stay rendered until both: caller says we can hide AND floor met.
  if (!visible && floorMet) return null;
  if (shownAt === null && !visible) return null;

  return (
    <div className="connecting-panel-backdrop">
      <div className="connecting-panel">
        <PreeceMeetMark size={72} />
        <div className="connecting-label">CONNECTING…</div>
        <div className="connecting-bar"><span /></div>
        {subLabel && <div className="connecting-sub">{subLabel}</div>}
      </div>
    </div>
  );
}
