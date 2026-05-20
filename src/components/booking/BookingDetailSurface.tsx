'use client';

import { type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Dialog } from '@/components/ui/primitives/Dialog';
import { Sheet } from '@/components/ui/primitives/Sheet';
import { cn } from '@/components/ui/primitives/cn';
import type { BookingDetailPresentation } from '@/components/booking/booking-detail-types';

export interface BookingDetailSurfaceProps {
  presentation: BookingDetailPresentation;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
  panelShellStyle?: CSSProperties;
  popoverDismissLayer?: ReactNode;
  nestedBookingOpen?: boolean;
  panelClassName: string;
  children: ReactNode;
}

/**
 * Presentation chrome for booking detail (drawer / modal / calendar popover).
 * Body content is supplied by {@link BookingDetailPanel} until full extract to BookingDetailContent.
 */
export function BookingDetailSurface({
  presentation,
  onClose,
  panelRef,
  panelShellStyle,
  popoverDismissLayer,
  nestedBookingOpen,
  panelClassName,
  children,
}: BookingDetailSurfaceProps) {
  const isPopover = presentation === 'popover';
  const isModal = presentation === 'modal';

  const panelInner = (
    <div
      ref={panelRef}
      role={isPopover ? 'dialog' : 'region'}
      aria-modal={isPopover ? false : undefined}
      aria-label="Booking detail panel"
      className={panelClassName}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  const handleOpenChange = (open: boolean) => {
    if (!open && !nestedBookingOpen) onClose();
  };

  const handleOverlayDismiss = () => {
    if (!nestedBookingOpen) onClose();
  };

  if (isModal) {
    return (
      <>
        <Dialog
          open
          onOpenChange={handleOpenChange}
          title="Booking detail"
          hideHeader
          size="lg"
          showClose={false}
          onOverlayClick={handleOverlayDismiss}
          contentClassName="flex h-[min(85dvh,85vh)] max-h-[min(90dvh,90vh)] min-h-0 w-full max-w-2xl flex-col overflow-hidden p-0"
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        >
          <div className="flex shrink-0 items-center justify-end border-b border-slate-100 bg-white/95 px-3 py-2">
            <button
              type="button"
              aria-label="Close booking detail"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            {panelInner}
          </div>
        </Dialog>
        {popoverDismissLayer}
      </>
    );
  }

  if (presentation === 'drawer') {
    return (
      <>
        <Sheet
          open
          onOpenChange={handleOpenChange}
          title="Booking detail"
          hideHeader
          showClose={false}
          side="right"
          contentClassName="flex h-full max-w-md flex-col overflow-hidden p-0 lg:max-w-lg"
        >
          {panelInner}
        </Sheet>
        {popoverDismissLayer}
      </>
    );
  }

  return (
    <>
      {popoverDismissLayer}
      <div className="fixed" style={panelShellStyle} onClick={undefined}>
        {panelInner}
      </div>
    </>
  );
}
