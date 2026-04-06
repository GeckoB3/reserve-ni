"use client";

import { useState, type ReactNode } from "react";

/** Same outline + eye icon as CommCard / template previews. */
export function OutlinePreviewButton({
  isAdmin,
  label,
  onClick,
}: {
  isAdmin: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!isAdmin}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
      {label}
    </button>
  );
}

/** Collapsible optional message + preview, aligned with CommCard behaviour. */
export function CustomMessageBlock({
  isAdmin,
  value,
  maxChars,
  onChange,
  onPreview,
  previewButtonLabel,
  showSmsSegmentHint,
}: {
  isAdmin: boolean;
  value: string;
  maxChars: number;
  onChange: (next: string) => void;
  onPreview?: () => void;
  previewButtonLabel: string;
  /** When true, warn if length exceeds SMS single-segment size (160 chars). */
  showSmsSegmentHint?: boolean;
}) {
  const [expanded, setExpanded] = useState(() => Boolean(value.trim()));
  const hasText = Boolean(value.trim());

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
          {hasText ? "Edit optional message" : "Add optional message"}
        </button>
        {onPreview && (
          <OutlinePreviewButton
            isAdmin={isAdmin}
            label={previewButtonLabel}
            onClick={onPreview}
          />
        )}
      </div>
      {expanded && (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={(e) => {
              const val = e.target.value.slice(0, maxChars);
              onChange(val);
            }}
            disabled={!isAdmin}
            rows={3}
            placeholder="Added after the standard text in the message…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              {value.length}/{maxChars} characters
            </span>
            {showSmsSegmentHint && value.length > 160 && (
              <span className="font-medium text-amber-600">
                SMS messages over 160 characters may be split
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FieldBlock({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
      <h4 id={titleId} className="text-sm font-semibold text-slate-900">
        {title}
      </h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand-600" : "bg-slate-200"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
