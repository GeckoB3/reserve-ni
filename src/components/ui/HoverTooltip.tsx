'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export type HoverTooltipProps = {
  label: string;
  hint?: string;
  placement?: TooltipPlacement;
  children: ReactNode;
};

type PanelCoords = { top: number; left: number };

function subscribeToNothing() {
  return () => {};
}

export function HoverTooltip({ label, hint, placement = 'left', children }: HoverTooltipProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [coords, setCoords] = useState<PanelCoords | null>(null);

  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const margin = 10;
    const gap = 8;
    const rect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'left':
        top = rect.top + rect.height / 2 - panelRect.height / 2;
        left = rect.left - panelRect.width - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - panelRect.height / 2;
        left = rect.right + gap;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - panelRect.width / 2;
        break;
      case 'top':
      default:
        top = rect.top - panelRect.height - gap;
        left = rect.left + rect.width / 2 - panelRect.width / 2;
        break;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    left = Math.max(margin, Math.min(left, vw - panelRect.width - margin));
    top = Math.max(margin, Math.min(top, vh - panelRect.height - margin));

    setCoords({ top, left });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      computePosition();
      requestAnimationFrame(computePosition);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, label, hint, placement, computePosition]);

  useEffect(() => {
    if (!open) return;
    const onReflow = () => computePosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, computePosition]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setCoords(null);
  };

  const panel =
    open &&
    mounted &&
    createPortal(
      <div
        ref={panelRef}
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none fixed z-[1100] flex w-max max-w-[15rem] flex-col gap-0.5 rounded-lg bg-slate-800 px-3 py-2 text-left shadow-lg shadow-slate-900/30 ring-1 ring-white/10 transition-opacity duration-150"
        style={{
          top: coords?.top ?? -9999,
          left: coords?.left ?? 0,
          visibility: coords ? 'visible' : 'hidden',
        }}
      >
        <span className="text-xs font-semibold leading-tight text-white">{label}</span>
        {hint ? <span className="text-[11px] leading-snug text-slate-300">{hint}</span> : null}
      </div>,
      document.body,
    );

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span aria-describedby={open ? tooltipId : undefined} className="inline-flex">
          {children}
        </span>
      </span>
      {panel}
    </>
  );
}
