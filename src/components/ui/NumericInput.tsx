'use client';

/**
 * Numeric input that can be fully cleared while editing (desktop + mobile).
 *
 * Uses type="text" + inputMode so the numeric keyboard appears on mobile and
 * controlled `type="number"` re-fill issues (parseInt(...) || default in parents)
 * never block deleting digits. On blur, empty input snaps to `min` if set, else 0.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** Allow decimal values (uses inputMode="decimal"). Default: false. */
  allowFloat?: boolean;
  min?: number;
  max?: number;
}

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
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
