import { useEffect, useState } from 'react';
import { windowCtl } from '../runtime';

// Frameless window min/max/close buttons. Only rendered on Windows/Linux —
// macOS keeps the native traffic lights via titleBarStyle: 'hiddenInset'.

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void windowCtl.isMaximized().then(setMaximized);
    return windowCtl.onMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="window-controls" role="group" aria-label="Window controls">
      <button className="win-ctrl" onClick={() => void windowCtl.minimize()} title="Minimize" aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1"/></svg>
      </button>
      <button className="win-ctrl" onClick={() => void windowCtl.toggleMaximize()} title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore' : 'Maximize'}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2.5" y="0.5" width="7" height="7"/>
            <rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg-bar)"/>
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9"/>
          </svg>
        )}
      </button>
      <button className="win-ctrl close" onClick={() => void windowCtl.close()} title="Close" aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1"/></svg>
      </button>
    </div>
  );
}
