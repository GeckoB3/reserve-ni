'use client';

import { useFullscreen } from '@/hooks/useFullscreen';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

type FullscreenToggleButtonProps = {
  className?: string;
};

/**
 * Icon control to enter/exit browser fullscreen (document element).
 * Hidden when the Fullscreen API is unavailable (e.g. some mobile browsers).
 */
export function FullscreenToggleButton({ className = '' }: FullscreenToggleButtonProps) {
  const { isFullscreen, supported, toggle } = useFullscreen();

  if (!supported) return null;

  const label = isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen';

  return (
    <HoverTooltip label={label} placement="left">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={label}
        aria-pressed={isFullscreen}
        className={`flex shrink-0 items-center justify-center rounded-xl px-3 py-2.5 text-slate-600 ring-1 ring-slate-100 transition-colors hover:bg-white/70 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${className}`}
      >
        {isFullscreen ? <ExitFullscreenIcon className="h-[1.35rem] w-[1.35rem]" /> : <EnterFullscreenIcon className="h-[1.35rem] w-[1.35rem]" />}
      </button>
    </HoverTooltip>
  );
}

function EnterFullscreenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 3h6v2H5v4H3V3z" />
      <path d="M21 3h-6v2h4v4h2V3z" />
      <path d="M3 21h6v-2H5v-4H3v6z" />
      <path d="M21 21h-6v-2h4v-4h2v6z" />
    </svg>
  );
}

function ExitFullscreenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d="M9 9V3M9 9H3" />
      <path d="M15 9V3M15 9H21" />
      <path d="M9 15V21M9 15H3" />
      <path d="M15 15V21M15 15H21" />
    </svg>
  );
}
