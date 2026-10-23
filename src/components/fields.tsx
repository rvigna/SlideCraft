import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NumberInput } from '@carbon/react';
import { endCoalesce } from '../store/editor';
import { toHex6 } from '../model/color';

/**
 * Carbon NumberInput that edits a model value: typing is local until blur/Enter,
 * stepper clicks apply immediately.
 */
export function NumField({ label, value, onCommit, min, max, step = 1, hideLabel, hideSteppers, disabled, className }: {
  label: string; value: number; onCommit: (v: number) => void;
  min?: number; max?: number; step?: number; hideLabel?: boolean; hideSteppers?: boolean; disabled?: boolean; className?: string;
}) {
  const id = useId();
  const [text, setText] = useState<string | number>(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(Number.isFinite(value) ? +value.toFixed(2) : 0); }, [value]);

  const commit = (raw: string | number) => {
    let v = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(v)) { setText(value); return; }
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    if (v !== value) onCommit(v);
    setText(v);
  };

  return (
    <div className={className}><NumberInput
      id={id}
      hideSteppers={hideSteppers}
      size="sm"
      label={label}
      hideLabel={hideLabel}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      allowEmpty
      disableWheel
      onFocus={() => { focused.current = true; }}
      onBlur={e => { focused.current = false; commit(e.target.value); }}
      onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
      onChange={(e, state) => {
        setText(state.value);
        if (e.type === 'click') commit(state.value); // stepper buttons
      }}
    /></div>
  );
}

/** Toolbar-style color button: an icon with a swatch bar over a native color input */
export function ColorButton({ label, value, onPick, icon, disabled }: {
  label: string; value: string; onPick: (color: string) => void; icon: ReactNode; disabled?: boolean;
}) {
  const hex = value && value !== 'transparent' ? '#' + toHex6(value, 'FFFFFF').toLowerCase() : '#ffffff';
  return (
    <label className={`sc-color-btn${disabled ? ' is-disabled' : ''}`} title={label}>
      {icon}
      <span className="sc-color-swatch" style={{ background: value === 'transparent' ? 'repeating-conic-gradient(#c6c6c6 0 25%, #fff 0 50%) 0 0/6px 6px' : value }} />
      <input
        type="color"
        aria-label={label}
        value={hex}
        disabled={disabled}
        onChange={e => onPick(e.target.value)}
        onBlur={endCoalesce}
      />
    </label>
  );
}
