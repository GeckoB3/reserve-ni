'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';

interface TicketTypeAvail {
  id: string;
  name: string;
  price_pence: number;
  capacity: number | null;
  remaining: number;
}

interface EventAvail {
  event_id: string;
  event_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  remaining_capacity: number;
  ticket_types: TicketTypeAvail[];
}

type Step = 'events' | 'tickets' | 'details' | 'payment' | 'confirmation';

export function EventBookingFlow({ venue, cancellationPolicy }: { venue: VenuePublic; cancellationPolicy?: string }) {
  const [step, setStep] = useState<Step>('events');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<EventAvail[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventAvail | null>(null);
  const [ticketSelections, setTicketSelections] = useState<Record<string, number>>({});
  const [guestDetails, setGuestDetails] = useState<GuestDetails | null>(null);
  const [createResult, setCreateResult] = useState<{ booking_id: string; client_secret?: string; stripe_account_id?: string; requires_deposit: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/availability?venue_id=${venue.id}&date=${date}`);
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [venue.id, date]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const totalTickets = Object.values(ticketSelections).reduce((a, b) => a + b, 0);
  const totalPricePence = selectedEvent
    ? selectedEvent.ticket_types.reduce((sum, tt) => sum + (ticketSelections[tt.id] ?? 0) * tt.price_pence, 0)
    : 0;

  const handleDetailsSubmit = useCallback(async (details: GuestDetails) => {
    setGuestDetails(details);
    setError(null);
    if (!selectedEvent) return;
    try {
      const ticket_lines = selectedEvent.ticket_types
        .filter((tt) => (ticketSelections[tt.id] ?? 0) > 0)
        .map((tt) => ({
          ticket_type_id: tt.id,
          label: tt.name,
          quantity: ticketSelections[tt.id]!,
          unit_price_pence: tt.price_pence,
        }));

      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          booking_date: selectedEvent.event_date,
          booking_time: selectedEvent.start_time,
          party_size: totalTickets,
          name: details.name,
          email: details.email || undefined,
          phone: details.phone,
          source: 'booking_page',
          experience_event_id: selectedEvent.event_id,
          ticket_lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setCreateResult({ booking_id: data.booking_id, client_secret: data.client_secret, stripe_account_id: data.stripe_account_id, requires_deposit: data.requires_deposit ?? false });
      setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, selectedEvent, ticketSelections, totalTickets]);

  const handlePaymentComplete = useCallback(async () => {
    if (createResult?.booking_id) {
      try {
        await fetch('/api/booking/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: createResult.booking_id }),
        });
      } catch { /* webhook fallback */ }
    }
    setStep('confirmation');
  }, [createResult?.booking_id]);

  return (
    <div className="mx-auto max-w-lg">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'events' && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Upcoming Events</h2>
          <div className="mb-4">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-500">No events on this date.</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <button
                  key={event.event_id}
                  onClick={() => { setSelectedEvent(event); setTicketSelections({}); setStep('tickets'); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-brand-300"
                >
                  <div className="font-semibold text-slate-900">{event.event_name}</div>
                  <div className="text-sm text-slate-500">{event.start_time.slice(0, 5)} – {event.end_time.slice(0, 5)}</div>
                  {event.description && <p className="mt-1 text-sm text-slate-600 line-clamp-2">{event.description}</p>}
                  <div className="mt-2 text-xs text-slate-400">{event.remaining_capacity} spots remaining</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'tickets' && selectedEvent && (
        <div>
          <button onClick={() => setStep('events')} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">{selectedEvent.event_name}</h2>
          <p className="mb-4 text-sm text-slate-500">{selectedEvent.event_date} &middot; {selectedEvent.start_time.slice(0, 5)} – {selectedEvent.end_time.slice(0, 5)}</p>
          <div className="space-y-3">
            {selectedEvent.ticket_types.map((tt) => (
              <div key={tt.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div>
                  <div className="font-medium text-slate-900">{tt.name}</div>
                  <div className="text-sm text-slate-500">£{(tt.price_pence / 100).toFixed(2)} &middot; {tt.remaining} left</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTicketSelections((p) => ({ ...p, [tt.id]: Math.max(0, (p[tt.id] ?? 0) - 1) }))}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
                    disabled={(ticketSelections[tt.id] ?? 0) <= 0}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{ticketSelections[tt.id] ?? 0}</span>
                  <button
                    onClick={() => setTicketSelections((p) => ({ ...p, [tt.id]: Math.min(tt.remaining, (p[tt.id] ?? 0) + 1) }))}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
                    disabled={(ticketSelections[tt.id] ?? 0) >= tt.remaining}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          {totalTickets > 0 && (
            <div className="mt-6">
              <div className="mb-3 text-right text-sm font-medium text-slate-700">
                Total: £{(totalPricePence / 100).toFixed(2)} ({totalTickets} ticket{totalTickets !== 1 ? 's' : ''})
              </div>
              <button
                onClick={() => setStep('details')}
                className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'details' && (
        <div>
          <button onClick={() => setStep('tickets')} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <DetailsStep
            slot={{ key: 'event', label: selectedEvent?.event_name ?? '', start_time: selectedEvent?.start_time ?? '', end_time: selectedEvent?.end_time ?? '', available_covers: totalTickets }}
            date={selectedEvent?.event_date ?? date}
            partySize={totalTickets}
            onSubmit={handleDetailsSubmit}
            onBack={() => setStep('tickets')}
            requiresDeposit={totalPricePence > 0}
          />
        </div>
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={totalPricePence}
          partySize={totalTickets}
          onComplete={handlePaymentComplete}
          onBack={() => setStep('details')}
          cancellationPolicy={cancellationPolicy}
        />
      )}

      {step === 'confirmation' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-900">Booking Confirmed</h2>
          <p className="mt-2 text-sm text-green-700">
            {selectedEvent?.event_name}<br />
            {selectedEvent?.event_date} at {selectedEvent?.start_time.slice(0, 5)}<br />
            {totalTickets} ticket{totalTickets !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
