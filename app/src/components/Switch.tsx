// Reusable toggle switch. One canonical implementation so every settings
// screen renders the same track+knob. Uses a button internally (not a
// checkbox) so we don't have to fight browser-default checkbox rendering
// or pseudo-element positioning quirks.

import type { KeyboardEvent, MouseEvent } from 'react';

interface Props {
  checked:   boolean;
  onChange:  (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export default function Switch({ checked, onChange, disabled, ariaLabel }: Props) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (disabled) return;
    onChange(!checked);
  }
  function handleKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onChange(false); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(true);  }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={`pm-switch${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKey}
      tabIndex={disabled ? -1 : 0}
    >
      <span className="pm-switch-knob" aria-hidden />
    </button>
  );
}
