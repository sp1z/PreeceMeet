import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Self-hosted fonts — bundled via @fontsource so the app doesn't need to
// reach Google Fonts at runtime. Ships identically on Windows, Mac, Linux
// (and works fully offline). Import BEFORE index.css so the @font-face
// declarations exist before our brand tokens reference them.
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Tell the main process to reveal the (hidden) window only once we've
// painted. Two rAFs — one to yield for React's first commit, a second for
// the browser's layout+paint — so the first frame the user sees is the
// splash already on screen, not an empty dark window.
function signalReady() {
  try { window.preecemeet?.appReady?.(); } catch { /* browser dev mode */ }
}
requestAnimationFrame(() => requestAnimationFrame(signalReady));
