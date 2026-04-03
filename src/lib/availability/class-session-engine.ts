/**
 * Model D: Class / group session availability engine.
 * Given class instances for a date + existing bookings,
 * returns remaining capacity per class instance.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassType, ClassInstance } from '@/types/booking-models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassEngineInput {
  date: string;
  classTypes: ClassType[];
  instances: ClassInstance[];
  /** Total booked spots per class_instance_id. */
  bookedByInstance: Record<string, number>;
}

export interface ClassAvailabilitySlot {
  instance_id: string;
  class_type_id: string;
  class_name: string;
  description: string | null;
  instance_date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  remaining: number;
  instructor_id: string | null;
  instructor_name: string | null;
  price_pence: number | null;
  requires_online_payment: boolean;
  colour: string;
}

const CAPACITY_CONSUMING_STATUSES = ['Confirmed', 'Pending', 'Seated'];

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function computeClassAvailability(input: ClassEngineInput): ClassAvailabilitySlot[] {
  const { classTypes, instances, bookedByInstance } = input;
  const typeMap = new Map(classTypes.map((ct) => [ct.id, ct]));

  const results: ClassAvailabilitySlot[] = [];

  for (const instance of instances) {
    if (instance.is_cancelled) continue;
    const classType = typeMap.get(instance.class_type_id);
    if (!classType || !classType.is_active) continue;

    const capacity = instance.capacity_override ?? classType.capacity;
    const booked = bookedByInstance[instance.id] ?? 0;
    const remaining = Math.max(0, capacity - booked);

    results.push({
      instance_id: instance.id,
      class_type_id: classType.id,
      class_name: classType.name,
      description: classType.description,
      instance_date: instance.instance_date,
      start_time: instance.start_time,
      duration_minutes: classType.duration_minutes,
      capacity,
      remaining,
      instructor_id: classType.instructor_id,
      instructor_name: classType.instructor_name ?? null,
      price_pence: classType.price_pence,
      requires_online_payment: classType.requires_online_payment !== false,
      colour: classType.colour,
    });
  }

  results.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return results;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetchClassInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
}): Promise<ClassEngineInput> {
  const { supabase, venueId, date } = params;

  const typesRes = await supabase
    .from('class_types')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  const classTypes = (typesRes.data ?? []) as ClassType[];
  const classTypeIds = classTypes.map((ct) => ct.id);

  const instancesPromise =
    classTypeIds.length === 0
      ? Promise.resolve({ data: [] as ClassInstance[] })
      : supabase
          .from('class_instances')
          .select('*')
          .eq('instance_date', date)
          .eq('is_cancelled', false)
          .in('class_type_id', classTypeIds)
          .order('start_time');

  const [instancesRes, bookingsRes] = await Promise.all([
    instancesPromise,
    supabase
      .from('bookings')
      .select('id, class_instance_id, party_size, status')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .not('class_instance_id', 'is', null)
      .in('status', CAPACITY_CONSUMING_STATUSES),
  ]);

  const instances = (instancesRes.data ?? []) as ClassInstance[];

  const bookedByInstance: Record<string, number> = {};
  for (const b of bookingsRes.data ?? []) {
    const instId = b.class_instance_id!;
    bookedByInstance[instId] = (bookedByInstance[instId] ?? 0) + (b.party_size ?? 1);
  }

  return { date, classTypes, instances, bookedByInstance };
}
