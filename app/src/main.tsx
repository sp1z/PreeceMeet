import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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
