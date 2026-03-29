'use client';

/**
 * Adaptive numeric input — mobile-friendly while preserving desktop UX.
 *
 * Desktop: renders a standard type="number" input with native spinners.
 * Mobile/touch: renders type="text" + inputMode="numeric" so the numeric
 * keyboard appears and the field can be fully cleared before typing a new
 * value (the core mobile usability issue with type="number").
 *
 * On blur the field snaps to the nearest valid value if left empty.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** Allow decimal values (uses inputMode="decimal" on mobile). Default: false. */
  allowFloat?: boolean;
  min?: number;
  max?: number;
}

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    { value, onChange, allowFloat = false, min, max, className, onBlur, ...rest },
    ref,
  ) {
    const isTouch = useIsTouchDevice();
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // ─── Desktop path ────────────────────────────────────────────────
    // Standard type="number" — spinners, native validation, no change.
    if (!isTouch) {
      return (
        <input
          {...rest}
          ref={inputRef}
          type="number"
          min={min}
          max={max}
          step={allowFloat ? 'any' : 1}
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return;
            const n = allowFloat ? parseFloat(raw) : parseInt(raw, 10);
            if (!Number.isNaN(n)) onChange(clamp(n, min, max));
          }}
          onBlur={(e) => {
            if (e.target.value === '' && value == null) {
              const fallback = min ?? 0;
              onChange(fallback);
            }
            onBlur?.(e);
          }}
          className={className}
        />
      );
    }

    // ─── Mobile / touch path ─────────────────────────────────────────
    // type="text" + inputMode so the field can be fully cleared.
    return (
      <MobileFriendlyNumericInput
        ref={inputRef}
        value={value}
        onChange={onChange}
        allowFloat={allowFloat}
        min={min}
        max={max}
        className={className}
        onBlur={onBlur}
        {...rest}
      />
    );
  },
);

// Extracted into a sub-component so the string display state only lives
// in the mobile render path.
const MobileFriendlyNumericInput = forwardRef<
  HTMLInputElement,
  NumericInputProps
>(function MobileFriendlyNumericInput(
  { value, onChange, allowFloat = false, min, max, className, onBlur, ...rest },
  ref,
) {
  const toString = (v: number | null | undefined) =>
    v !== null && v !== undefined && !Number.isNaN(v) ? String(v) : '';

  const [display, setDisplay] = useState<string>(toString(value));
  const lastPropRef = useRef<number | null | undefined>(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    if (value === lastPropRef.current) return;
    lastPropRef.current = value;
    const id = requestAnimationFrame(() => setDisplay(toString(value)));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const parse = (s: string): number | null => {
    if (s === '' || s === '-') return null;
    const n = allowFloat ? parseFloat(s) : parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const filtered = allowFloat
      ? raw.replace(/[^0-9.]/g, '')
      : raw.replace(/[^0-9]/g, '');
    setDisplay(filtered);

    const n = parse(filtered);
    if (n !== null) {
      const clamped = clamp(n, min, max);
      lastPropRef.current = clamped;
      onChange(clamped);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const n = parse(display);
    const fallback = min ?? 0;
    const final = n !== null ? clamp(n, min, max) : fallback;
    setDisplay(String(final));
    if (final !== lastPropRef.current) {
      lastPropRef.current = final;
      onChange(final);
    }
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode={allowFloat ? 'decimal' : 'numeric'}
      pattern={allowFloat ? '[0-9.]*' : '[0-9]*'}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
});

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}
