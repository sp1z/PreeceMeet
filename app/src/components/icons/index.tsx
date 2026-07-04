// Stroke line icons for all PreeceMeet system chrome.
// Per handoff §Icons: 20px in the control pill / 14–17px elsewhere,
// stroke-width 2, round caps/joins, currentColor. Filled variants only
// for phone-accept / phone-decline; those live at the bottom.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, extra?: SVGProps<SVGSVGElement>) {
  return {
    width:  size,
    height: size,
    viewBox: '0 0 24 24',
    fill:   'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap:  'round' as const,
    strokeLinejoin: 'round' as const,
    ...extra,
  };
}

// ── AV controls ─────────────────────────────────────────────────────────────

export function MicIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
export function MicOffIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 3l18 18" />
      <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-.4 1.5" />
      <path d="M5 11a7 7 0 0 0 12 5" />
      <path d="M12 18v3" />
    </svg>
  );
}
export function CamIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}
export function CamOffIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 3l18 18" />
      <path d="M16 10l5-3v10l-5-3z" />
      <path d="M15 15V8a1 1 0 0 0-1-1H9" />
      <path d="M3 8v9a1 1 0 0 0 1 1h8" />
    </svg>
  );
}
export function ScreenShareIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M12 12V7" />
      <path d="M9 10l3-3 3 3" />
    </svg>
  );
}
export function PassThruIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M7 10c1.5-2.5 3.5-3.5 5-3.5s3.5 1 5 3.5c-1.5 2.5-3.5 3.5-5 3.5s-3.5-1-5-3.5z" />
    </svg>
  );
}
export function ChatIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 5h16v11H8l-4 4z" />
    </svg>
  );
}
export function GameModeIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <rect x="12" y="11" width="8" height="6" rx="1.2" />
    </svg>
  );
}
export function HangupIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <g transform="rotate(135 12 12)">
        <path d="M4 12c4-4 12-4 16 0l-2 2c-1-1-3-1.5-4-1.5v3l-4 1-4-1v-3c-1 0-3 .5-4 1.5z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// ── Chrome / system ─────────────────────────────────────────────────────────

export function SettingsIcon({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
export function AdminIcon({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
export function KebabIcon({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="5"  r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function BurgerIcon({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
export function FullscreenIcon({ exit = false, size = 18, ...p }: IconProps & { exit?: boolean }) {
  return exit ? (
    <svg {...base(size, p)}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ) : (
    <svg {...base(size, p)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}
export function ConnQualityIcon({ size = 17, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 17c3-5 5-8 9-8s6 3 9 8" />
      <path d="M3 17l4-2 4 3 4-4 5 3" />
    </svg>
  );
}
export function SendIcon({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 20l17-8L4 4l3 8-3 8z" />
      <path d="M7 12h14" />
    </svg>
  );
}
export function EditIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13 6l4 4" />
    </svg>
  );
}
export function CloseIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
export function PlusIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function ChevronDownIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
export function CheckIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}
export function LogoutIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
export function SelfIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11" width="7" height="6" rx="1.2" />
    </svg>
  );
}

// ── Filled — phone accept / decline for ring modals ─────────────────────────

export function PhoneAcceptIcon({ size = 22, ...p }: Omit<IconProps, 'stroke'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.4 2.3.6 3.6.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6a1 1 0 0 1-.24 1z" />
    </svg>
  );
}
export function PhoneDeclineIcon({ size = 22, ...p }: Omit<IconProps, 'stroke'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
      <g transform="rotate(135 12 12)">
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.4 2.3.6 3.6.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6a1 1 0 0 1-.24 1z" />
      </g>
    </svg>
  );
}
