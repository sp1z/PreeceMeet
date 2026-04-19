// React component: PreeceMeet brand mark.
// Drop into your codebase and style with your token system.
// The mark is viewBox 0 0 256 256 — wrap it at any size via width/height props.

import React from "react";

type Variant = "primary" | "mono" | "onBlue" | "onDark";

export interface PreeceMeetMarkProps {
  size?: number | string;
  variant?: Variant;
  /** Render a rounded tile background */
  tile?: boolean;
  /** Border radius of the tile as a fraction of the 256 viewBox. 56 = default (≈ macOS squircle). */
  tileRadius?: number;
  /** Show the small live-signal dot */
  showDot?: boolean;
  className?: string;
  title?: string;
}

const PALETTES: Record<Variant, { stem: string; bowl: string; bubble: string; dot: string; tile?: string }> = {
  primary: {
    stem:   "url(#pm-stem)",
    bowl:   "url(#pm-bowl)",
    bubble: "#FFFFFF",
    dot:    "#2563EB",
    tile:   "url(#pm-tile)",
  },
  mono: {
    stem:   "currentColor",
    bowl:   "currentColor",
    bubble: "#FFFFFF",
    dot:    "currentColor",
  },
  onBlue: {
    stem:   "#0B1220",
    bowl:   "#FFFFFF",
    bubble: "#2563EB",
    dot:    "#FFFFFF",
    tile:   "#2563EB",
  },
  onDark: {
    stem:   "#60A5FA",
    bowl:   "#2563EB",
    bubble: "#0B1220",
    dot:    "#60A5FA",
    tile:   "#0B1220",
  },
};

export function PreeceMeetMark({
  size = 64,
  variant = "primary",
  tile = true,
  tileRadius = 56,
  showDot = true,
  className,
  title = "PreeceMeet",
}: PreeceMeetMarkProps) {
  const p = PALETTES[variant];
  const uid = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {variant === "primary" && (
        <defs>
          <clipPath id={`clip-${uid}`}>
            <rect width="256" height="256" rx={tileRadius} />
          </clipPath>
          <linearGradient id="pm-stem" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="100%" stopColor="#0F2463" />
          </linearGradient>
          <linearGradient id="pm-bowl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="pm-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5F7FB" />
            <stop offset="100%" stopColor="#DFE4EE" />
          </linearGradient>
        </defs>
      )}

      {tile && p.tile && (
        <g clipPath={variant === "primary" ? `url(#clip-${uid})` : undefined}>
          <rect width="256" height="256" rx={tileRadius} fill={p.tile} />
        </g>
      )}

      {/* Stem — square top-right, rounded bottom corners */}
      <path
        d="M 66 52 H 100 V 202 a 6 6 0 0 1 -6 6 H 72 a 6 6 0 0 1 -6 -6 Z"
        fill={p.stem}
      />
      {/* Bowl of the P */}
      <path
        d="M 66 52 H 140 a 48 48 0 0 1 48 48 v 8 a 48 48 0 0 1 -48 48 H 100 V 52 Z"
        fill={p.bowl}
      />
      {/* Speech-bubble counter (white, tail points down-right) */}
      <path
        d="M 100 76 H 138 a 24 24 0 0 1 24 24 v 2 a 24 24 0 0 1 -24 24 H 134 L 114 150 L 120 124 H 100 Z"
        fill={p.bubble}
      />
      {/* Signal / live dot */}
      {showDot && <circle cx="138" cy="100" r="9" fill={p.dot} />}
    </svg>
  );
}

/* Wordmark component for the standard lockup.
   "Preece" in ink, "Meet" in primary blue (or light blue on dark bg). */
export function PreeceMeetWordmark({
  size = 32,
  onDark = false,
  className,
}: {
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontWeight: 600,
        letterSpacing: "-0.8px",
        fontSize: size,
        lineHeight: 1,
        color: onDark ? "#FFFFFF" : "#0B1220",
      }}
    >
      Preece
      <span style={{ color: onDark ? "#60A5FA" : "#2563EB" }}>Meet</span>
    </span>
  );
}
