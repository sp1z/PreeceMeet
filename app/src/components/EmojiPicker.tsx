import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// Curated emoji set — these are chosen because they have well-supported color
// glyphs across Apple Color Emoji, Segoe UI Emoji, and Noto Color Emoji.
// Grouped for the popover; change at will without breaking saved channels
// (emoji is a raw unicode string, not an ID).

const GROUPS: { label: string; chars: string[] }[] = [
  {
    label: 'People',
    chars: ['🙂','😀','😎','🤓','🧐','😇','🤠','🥳','🤖','👻','🦊','🐱','🐶','🐼','🐨','🐯','🦁','🐸','🐵','🦉'],
  },
  {
    label: 'Symbols',
    chars: ['💬','💡','🔥','⭐','✨','🎯','🎮','🎵','🎨','📚','📷','📞','📺','💻','🖥️','⌨️','🖱️','🛠️','🔧','📌'],
  },
  {
    label: 'Activity',
    chars: ['🎮','🏀','⚽','🎲','🎸','🎤','🎧','🏎️','✈️','🚀','🛸','🏝️','🏔️','🌊','🌲','🌵','🌙','☀️','⚡','🌈'],
  },
  {
    label: 'Food',
    chars: ['☕','🍕','🍔','🍟','🌮','🍣','🍩','🍪','🍰','🥐','🍎','🍉','🍌','🍇','🥑','🧀','🍺','🍷','🍵','🧋'],
  },
  {
    label: 'Flags',
    chars: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🇬🇧','🇺🇸','🇪🇺','🇨🇦','🇦🇺','🇳🇿','🇯🇵','🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇳🇱','🇮🇪','🇵🇱'],
  },
];

interface Props {
  value:     string;
  onChange:  (emoji: string) => void;
  size?:     'sm' | 'md';
  className?: string;
}

const POPOVER_W = 260;
const POPOVER_H = 280;

export default function EmojiPicker({ value, onChange, size = 'md', className }: Props) {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState(0);
  const [pos,  setPos]  = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // Prefer below; flip above if not enough room. Clamp inside viewport.
    const below  = r.bottom + 6;
    const above  = r.top - 6 - POPOVER_H;
    const top    = window.innerHeight - below < POPOVER_H && above >= 8 ? above : below;
    const rawLeft = r.left;
    const left   = Math.max(8, Math.min(rawLeft, window.innerWidth - POPOVER_W - 8));
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`emoji-picker ${className || ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`emoji-picker-trigger emoji-picker-${size}`}
        onClick={() => setOpen(o => !o)}
        title="Change emoji"
      >
        <span className="emoji">{value || '❓'}</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="emoji-picker-popover"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="emoji-picker-tabs">
            {GROUPS.map((g, i) => (
              <button
                key={g.label}
                type="button"
                className={`emoji-picker-tab${tab === i ? ' active' : ''}`}
                onClick={() => setTab(i)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="emoji-picker-grid">
            {GROUPS[tab].chars.map(ch => (
              <button
                key={ch}
                type="button"
                className={`emoji-picker-cell${ch === value ? ' active' : ''}`}
                onClick={() => { onChange(ch); setOpen(false); }}
              >
                <span className="emoji">{ch}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
