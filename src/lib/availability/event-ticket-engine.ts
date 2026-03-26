/**
 * Model C: Event / experience ticket availability engine.
 * Given events + ticket types + existing bookings for a date,
 * returns remaining capacity per event and per ticket type.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExperienceEvent, EventTicketType } from '@/types/booking-models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventEngineInput {
  date: string;
  events: ExperienceEvent[];
  ticketTypes: EventTicketType[];
  /** Total booked quantity per event (all statuses that consume capacity). */
  bookedByEvent: Record<string, number>;
  /** Total booked quantity per ticket type. */
  bookedByTicketType: Record<string, number>;
}

export interface EventAvailabilitySlot {
  event_id: string;
  event_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  image_url: string | null;
  total_capacity: number;
  remaining_capacity: number;
  ticket_types: Array<{
    id: string;
    name: string;
    price_pence: number;
    capacity: number | null;
    remaining: number;
    sort_order: number;
  }>;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

const CAPACITY_CONSUMING_STATUSES = ['Confirmed', 'Pending', 'Seated'];

export function computeEventAvailability(input: EventEngineInput): EventAvailabilitySlot[] {
  const { events, ticketTypes, bookedByEvent, bookedByTicketType } = input;
  const ticketsByEvent = new Map<string, EventTicketType[]>();

  for (const tt of ticketTypes) {
    const list = ticketsByEvent.get(tt.event_id) ?? [];
    list.push(tt);
    ticketsByEvent.set(tt.event_id, list);
  }

  const results: EventAvailabilitySlot[] = [];

  for (const event of events) {
    if (!event.is_active) continue;

    const totalBooked = bookedByEvent[event.id] ?? 0;
    const remaining = Math.max(0, event.capacity - totalBooked);
    const eventTickets = ticketsByEvent.get(event.id) ?? [];

    const ticketResults = eventTickets
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((tt) => {
        const ttBooked = bookedByTicketType[tt.id] ?? 0;
        const ttCapacity = tt.capacity ?? event.capacity;
        return {
          id: tt.id,
          name: tt.name,
          price_pence: tt.price_pence,
          capacity: tt.capacity,
          remaining: Math.min(remaining, Math.max(0, ttCapacity - ttBooked)),
          sort_order: tt.sort_order,
        };
      });

    results.push({
      event_id: event.id,
      event_name: event.name,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      description: event.description,
      image_url: event.image_url,
      total_capacity: event.capacity,
      remaining_capacity: remaining,
      ticket_types: ticketResults,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetchEventInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
}): Promise<EventEngineInput> {
  const { supabase, venueId, date } = params;

  const [eventsRes, ticketTypesRes, bookingsRes] = await Promise.all([
    supabase
      .from('experience_events')
      .select('*')
      .eq('venue_id', venueId)
      .eq('event_date', date)
      .eq('is_active', true)
      .order('start_time'),
    supabase
      .from('event_ticket_types')
      .select('*')
      .in(
        'event_id',
        // sub-select: all event ids for this venue on this date
        (await supabase
          .from('experience_events')
          .select('id')
          .eq('venue_id', venueId)
          .eq('event_date', date)
          .eq('is_active', true)
        ).data?.map((e) => e.id) ?? []
      )
      .order('sort_order'),
    supabase
      .from('bookings')
      .select('id, experience_event_id, party_size, status')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .not('experience_event_id', 'is', null)
      .in('status', CAPACITY_CONSUMING_STATUSES),
  ]);

  const events = (eventsRes.data ?? []) as ExperienceEvent[];
  const ticketTypes = (ticketTypesRes.data ?? []) as EventTicketType[];

  // Aggregate booked counts
  const bookedByEvent: Record<string, number> = {};
  const bookedByTicketType: Record<string, number> = {};

  // Also need ticket lines for per-ticket-type counts
  const bookingIds = (bookingsRes.data ?? []).map((b) => b.id);
  let ticketLines: Array<{ booking_id: string; ticket_type_id: string | null; quantity: number }> = [];
  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from('booking_ticket_lines')
      .select('booking_id, ticket_type_id, quantity')
      .in('booking_id', bookingIds);
    ticketLines = data ?? [];
  }

  for (const b of bookingsRes.data ?? []) {
    const eventId = b.experience_event_id!;
    bookedByEvent[eventId] = (bookedByEvent[eventId] ?? 0) + (b.party_size ?? 0);
  }

  for (const tl of ticketLines) {
    if (tl.ticket_type_id) {
      bookedByTicketType[tl.ticket_type_id] = (bookedByTicketType[tl.ticket_type_id] ?? 0) + tl.quantity;
    }
  }

  return { date, events, ticketTypes, bookedByEvent, bookedByTicketType };
}
