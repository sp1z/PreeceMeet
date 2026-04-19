import { useState, useRef, useEffect } from 'react';

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

export default function EmojiPicker({ value, onChange, size = 'md', className }: Props) {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={`emoji-picker ${className || ''}`} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`emoji-picker-trigger emoji-picker-${size}`}
        onClick={() => setOpen(o => !o)}
        title="Change emoji"
      >
        <span className="emoji">{value || '❓'}</span>
      </button>
      {open && (
        <div className="emoji-picker-popover">
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
        </div>
      )}
    </div>
  );
}
