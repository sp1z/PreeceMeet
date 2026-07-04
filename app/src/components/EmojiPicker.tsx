// Emoji picker — thin wrapper around @emoji-mart/react (full Unicode set +
// search + skin-tone + recents) plus our brand trigger chip and portal
// positioning. Chose emoji-mart because it's the de-facto React picker and
// keeps its own emoji data (works offline, no CSP hits).

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface Props {
  value:     string;
  onChange:  (emoji: string) => void;
  size?:     'sm' | 'md';
  className?: string;
}

// emoji-mart's default rendered picker is 352 × 435 at "small" perLine=8.
// We pass explicit dimensions so our flip-above logic uses the right numbers.
const POPOVER_W = 352;
const POPOVER_H = 435;

interface EmojiPickResult {
  native?: string;
  shortcodes?: string;
  id?: string;
  unified?: string;
}

export default function EmojiPicker({ value, onChange, size = 'md', className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below   = r.bottom + 6;
    const above   = r.top - 6 - POPOVER_H;
    const top     = window.innerHeight - below < POPOVER_H && above >= 8 ? above : below;
    const rawLeft = r.left;
    const left    = Math.max(8, Math.min(rawLeft, window.innerWidth - POPOVER_W - 8));
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

  function handlePick(result: EmojiPickResult) {
    if (result?.native) {
      onChange(result.native);
      setOpen(false);
    }
  }

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
          className="emoji-picker-popover emoji-mart-wrap"
          style={{ left: pos.left, top: pos.top }}
        >
          <Picker
            data={data}
            onEmojiSelect={handlePick}
            theme="dark"
            previewPosition="none"
            skinTonePosition="search"
            maxFrequentRows={2}
            perLine={8}
            navPosition="top"
            emojiButtonSize={32}
            emojiSize={20}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
