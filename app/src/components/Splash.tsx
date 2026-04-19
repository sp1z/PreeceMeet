import { useEffect, useState } from 'react';

// Brand splash — recreates design_handoff_preecemeet_brand/splash.html in
// React/CSS. Total visible time: 4s on first launch, ~1s on warm launches.
// The 4s first-run window gives the loader bar time to complete a full
// sweep before we fade out.

const FIRST_RUN_MS = 4000;
const WARM_RUN_MS  = 1000;

interface Props {
  /** Fires when the splash animation has finished its introduction sequence. */
  onDone?: () => void;
  /** Shorthand: skip the long intro and show only wordmark + loader (e.g. warm launches). */
  quick?: boolean;
}

export default function Splash({ onDone, quick = false }: Props) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const delay = quick ? WARM_RUN_MS : FIRST_RUN_MS;
    const t = setTimeout(() => { setDone(true); onDone?.(); }, delay);
    return () => clearTimeout(t);
  }, [onDone, quick]);

  return (
    <div className={`pm-splash${quick ? ' pm-splash-quick' : ''}${done ? ' pm-splash-fading' : ''}`}>
      <div className="pm-splash-mark">
        <svg width="180" height="180" viewBox="0 0 256 256">
          <defs>
            <linearGradient id="pmSpStem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#0F2463" />
            </linearGradient>
            <linearGradient id="pmSpBowl" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
            <linearGradient id="pmSpTile" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F5F7FB" />
              <stop offset="100%" stopColor="#DFE4EE" />
            </linearGradient>
            <clipPath id="pmSpClip"><rect width="256" height="256" rx="56" /></clipPath>
          </defs>

          <g clipPath="url(#pmSpClip)">
            <rect width="256" height="256" fill="url(#pmSpTile)" />
          </g>

          <path
            className="pm-sp-stem"
            d="M 66 52 H 100 V 202 a 6 6 0 0 1 -6 6 H 72 a 6 6 0 0 1 -6 -6 Z"
            fill="url(#pmSpStem)"
          />
          <path
            className="pm-sp-bowl"
            d="M 66 52 H 140 a 48 48 0 0 1 48 48 v 8 a 48 48 0 0 1 -48 48 H 100 V 52 Z"
            fill="url(#pmSpBowl)"
          />
          <path
            className="pm-sp-bubble"
            d="M 100 76 H 138 a 24 24 0 0 1 24 24 v 2 a 24 24 0 0 1 -24 24 H 134 L 114 150 L 120 124 H 100 Z"
            fill="#ffffff"
          />
          <circle className="pm-sp-halo" cx="138" cy="100" r="9" fill="#60A5FA" />
          <circle className="pm-sp-dot"  cx="138" cy="100" r="9" fill="#2563EB" />
        </svg>
      </div>

      <div className="pm-splash-wordmark">
        Preece<span className="pm-splash-blue">Meet</span>
      </div>
      <div className="pm-splash-tagline">You can't beat PreeceMeet.</div>
      <div className="pm-splash-loader" />
    </div>
  );
}
