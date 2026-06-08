'use client';

import { BookPublicLayout } from '@/components/booking/BookPublicLayout';
import type { VenuePublic } from '@/components/booking/types';
import type { BookingPagePublicService } from '@/lib/booking/booking-page-tabs';

interface InlineBookingPreviewProps {
  /** Synthetic public venue built from draft branding (no iframe). */
  previewVenue: VenuePublic;
  device: 'mobile' | 'desktop';
  /** Bump only when the user clicks "Refresh" in the preview panel. */
  remountKey?: number;
  services?: BookingPagePublicService[];
  team?: Array<{ id: string; name: string }>;
}

/**
 * In-dashboard live preview of the public booking page. Renders the real
 * `BookPublicLayout` from a draft `VenuePublic` — no iframe. Shared by the
 * single-venue editor and the collective combined-page editor.
 */
export function InlineBookingPreview({
  previewVenue,
  device,
  remountKey = 0,
  services = [],
  team = [],
}: InlineBookingPreviewProps) {
  const width = device === 'mobile' ? 390 : '100%';

  return (
    <div className="flex justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-3">
      <div
        key={remountKey > 0 ? remountKey : undefined}
        className="h-[min(80vh,720px)] min-h-[600px] max-w-full overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
        style={{ width }}
      >
        <BookPublicLayout venue={previewVenue} services={services} team={team} />
      </div>
    </div>
  );
}
