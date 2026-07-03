// React component: PreeceMeet brand mark.
// Hexagon cell + circuit field + video-lens glyph. 512 viewBox.

import React from "react";

type Variant = "primary" | "mono" | "onBlue" | "onDark";

export interface PreeceMeetMarkProps {
  size?: number | string;
  variant?: Variant;
  /** Render a rounded tile background behind the hex (e.g. macOS dock squircle) */
  tile?: boolean;
  /** Border radius of the tile as a fraction of the 512 viewBox. 112 = default (~macOS squircle). */
  tileRadius?: number;
  /** Show the small tally light on the camera body */
  showDot?: boolean;
  className?: string;
  title?: string;
}

interface Palette {
  cell:   string;
  lens:   string;
  border: string;
  circuit: string;
  circuitSoft: string;
  tally:  string;
  tile?:  string;
  notchA: string;
  notchB: string;
  notchC: string;
}

const PALETTES: Record<Variant, Palette> = {
  primary: {
    cell:        "url(#pm-cell)",
    lens:        "url(#pm-lens)",
    border:      "url(#pm-border)",
    circuit:     "#38D8FF",
    circuitSoft: "#4488FF",
    tally:       "#0A1230",
    tile:        "url(#pm-tile)",
    notchA:      "#38D8FF",
    notchB:      "#4488FF",
    notchC:      "#3355DD",
  },
  mono: {
    cell:        "currentColor",
    lens:        "#FFFFFF",
    border:      "currentColor",
    circuit:     "currentColor",
    circuitSoft: "currentColor",
    tally:       "currentColor",
    notchA:      "currentColor",
    notchB:      "currentColor",
    notchC:      "currentColor",
  },
  onBlue: {
    cell:        "#3856D6",
    lens:        "#FFFFFF",
    border:      "#FFFFFF",
    circuit:     "#FFFFFF",
    circuitSoft: "#FFFFFF",
    tally:       "#3856D6",
    tile:        "#4263EB",
    notchA:      "#FFFFFF",
    notchB:      "#FFFFFF",
    notchC:      "#FFFFFF",
  },
  onDark: {
    // Transparent cell: the surrounding dark surface shows through, so the
    // hex border + bright lens gradient carry the identity at every size.
    cell:        "transparent",
    lens:        "url(#pm-lens)",
    border:      "url(#pm-border)",
    circuit:     "#38D8FF",
    circuitSoft: "#4488FF",
    tally:       "#0A1230",
    notchA:      "#38D8FF",
    notchB:      "#4488FF",
    notchC:      "#3355DD",
  },
};

const HEX_PATH =
  "M438 225 L374 114 Q356 83 320 83 L192 83 Q156 83 138 114 L74 225 Q56 256 74 287 L138 398 Q156 429 192 429 L320 429 Q356 429 374 398 L438 287 Q456 256 438 225 Z";

export function PreeceMeetMark({
  size = 64,
  variant = "primary",
  tile = false,
  tileRadius = 112,
  showDot = true,
  className,
  title = "PreeceMeet",
}: PreeceMeetMarkProps) {
  const p = PALETTES[variant];
  const uid = React.useId();
  const hexClipId = `pm-hexclip-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pm-cell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05091F" />
          <stop offset="1" stopColor="#0A0E2E" />
        </linearGradient>
        <linearGradient id="pm-border" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0"   stopColor="#38D8FF" />
          <stop offset=".5"  stopColor="#4488FF" />
          <stop offset="1"   stopColor="#3355DD" />
        </linearGradient>
        <linearGradient id="pm-lens" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"   stopColor="#A8EEFF" />
          <stop offset=".5"  stopColor="#5599FF" />
          <stop offset="1"   stopColor="#3366EE" />
        </linearGradient>
        <linearGradient id="pm-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F5F7FB" />
          <stop offset="1" stopColor="#DFE4EE" />
        </linearGradient>
        <clipPath id={hexClipId}><path d={HEX_PATH} /></clipPath>
      </defs>

      {tile && p.tile && (
        <rect width="512" height="512" rx={tileRadius} fill={p.tile} />
      )}

      {/* hex cell body */}
      <path d={HEX_PATH} fill={p.cell} />

      {/* circuit field (clipped to hex) */}
      <g clipPath={`url(#${hexClipId})`} fill="none" stroke={p.circuit}>
        <path d="M180 70 V452" strokeWidth="1" opacity=".07" />
        <path d="M256 60 V452" strokeWidth="1" opacity=".07" />
        <path d="M332 70 V452" strokeWidth="1" opacity=".07" />
        <path d="M60 180 H452" strokeWidth="1" opacity=".05" />
        <path d="M60 332 H452" strokeWidth="1" opacity=".05" />
        <path d="M104 300 H150 V132" strokeWidth="2.6" opacity=".32" />
        <path d="M408 214 H360 V344" strokeWidth="2.6" opacity=".32" stroke={p.circuitSoft} />
        <circle cx="150" cy="132" r="6" fill={p.circuit} opacity=".8" />
        <circle cx="360" cy="344" r="6" fill={p.circuitSoft} opacity=".8" />
        <circle cx="214" cy="372" r="5" fill={p.circuit} opacity=".65" />
        <circle cx="304" cy="372" r="5" fill={p.circuitSoft} opacity=".65" />
      </g>

      {/* video camera glyph */}
      <rect x="150" y="196" width="150" height="120" rx="26" fill={p.lens} />
      <path d="M312 226 L372 196 L372 316 L312 286 Z" fill={p.lens} />
      <circle cx="200" cy="256" r="30" fill="none" stroke={p.tally} strokeWidth="10" opacity=".4" />
      {showDot && <circle cx="272" cy="228" r="7" fill={p.tally} opacity=".55" />}

      {/* hex border */}
      <path d={HEX_PATH} fill="none" stroke={p.border} strokeWidth="5" />

      {/* top notch dots */}
      <circle cx="212" cy="83" r="7" fill={p.notchA} />
      <circle cx="256" cy="83" r="7" fill={p.notchB} />
      <circle cx="300" cy="83" r="7" fill={p.notchC} />
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
        fontFamily: '"Manrope", system-ui, -apple-system, sans-serif',
        fontWeight: 800,
        letterSpacing: "-0.03em",
        fontSize: size,
        lineHeight: 1,
        color: onDark ? "#F4F7FF" : "#0A0E2E",
      }}
    >
      Preece
      <span style={{ color: onDark ? "#5599FF" : "#4263EB" }}>Meet</span>
    </span>
  );
}
