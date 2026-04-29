import type { SupabaseClient } from '@supabase/supabase-js';
import { computeClassAvailability, fetchClassInput } from '@/lib/availability/class-session-engine';
import type { ClassCartLineInput, ClassCartQuoteLine, ClassCartQuoteResult } from '@/types/class-commerce';
import type { ClassPaymentRequirement } from '@/types/booking-models';

function onlineChargePenceForLine(
  cls: { payment_requirement: string; price_pence: number | null; deposit_amount_pence: number | null },
  partySize: number,
): number {
  const price = cls.price_pence ?? 0;
  const dep = cls.deposit_amount_pence ?? null;
  const depPer = dep ?? 0;
  const req = cls.payment_requirement;
  if (req === 'full_payment' && price > 0) return price * partySize;
  if (req === 'deposit' && depPer > 0) return depPer * partySize;
  return 0;
}

export async function quoteClassCart(
  admin: SupabaseClient,
  params: { venueId: string; lines: ClassCartLineInput[] },
): Promise<ClassCartQuoteResult> {
  const { venueId, lines } = params;
  const out: ClassCartQuoteLine[] = [];

  for (const line of lines) {
    const { data: inst, error: instErr } = await admin
      .from('class_instances')
      .select('id, instance_date, start_time, is_cancelled, class_type_id')
      .eq('id', line.class_instance_id)
      .maybeSingle();

    if (instErr || !inst) {
      out.push({
        class_instance_id: line.class_instance_id,
        party_size: line.party_size,
        booking_date: '',
        booking_time: '',
        class_name: '',
        class_type_id: '',
        remaining_before: 0,
        online_charge_pence: 0,
        payment_requirement: 'none',
        requires_stripe_checkout: false,
        ok: false,
        error: 'Session not found',
      });
      continue;
    }

    const row = inst as unknown as {
      instance_date: string;
      start_time: string;
      is_cancelled: boolean;
      class_type_id: string;
    };

    const { data: ctName, error: ctErr } = await admin
      .from('class_types')
      .select('name, venue_id')
      .eq('id', row.class_type_id)
      .maybeSingle();

    if (ctErr || !ctName || (ctName as { venue_id: string }).venue_id !== venueId) {
      out.push({
        class_instance_id: line.class_instance_id,
        party_size: line.party_size,
        booking_date: row.instance_date,
        booking_time: String(row.start_time).slice(0, 5),
        class_name: '',
        class_type_id: row.class_type_id,
        remaining_before: 0,
        online_charge_pence: 0,
        payment_requirement: 'none',
        requires_stripe_checkout: false,
        ok: false,
        error: 'Session does not belong to this venue',
      });
      continue;
    }

    const typeName = (ctName as { name?: string }).name ?? 'Class';

    if (row.is_cancelled) {
      out.push({
        class_instance_id: line.class_instance_id,
        party_size: line.party_size,
        booking_date: row.instance_date,
        booking_time: String(row.start_time).slice(0, 5),
        class_name: typeName,
        class_type_id: row.class_type_id,
        remaining_before: 0,
        online_charge_pence: 0,
        payment_requirement: 'none',
        requires_stripe_checkout: false,
        ok: false,
        error: 'Session cancelled',
      });
      continue;
    }

    const bookingDate = row.instance_date;
    const bookingTime = String(row.start_time).slice(0, 5);

    const input = await fetchClassInput({
      supabase: admin,
      venueId,
      date: bookingDate,
      forPublicBooking: true,
    });
    const avail = computeClassAvailability(input);
    const cls = avail.find((c) => c.instance_id === line.class_instance_id);
    const remaining = cls?.remaining ?? 0;
    const ok = cls != null && remaining >= line.party_size;
    const onlineCharge =
      cls != null ? onlineChargePenceForLine(cls, line.party_size) : 0;
    const requiresStripe = Boolean(cls?.requires_stripe_checkout);
    const payReq = (cls?.payment_requirement as ClassPaymentRequirement | undefined) ?? 'none';

    out.push({
      class_instance_id: line.class_instance_id,
      party_size: line.party_size,
      booking_date: bookingDate,
      booking_time: bookingTime,
      class_name: cls?.class_name ?? typeName,
      class_type_id: cls?.class_type_id ?? row.class_type_id,
      remaining_before: remaining,
      online_charge_pence: ok ? onlineCharge : 0,
      payment_requirement: ok ? payReq : 'none',
      requires_stripe_checkout: ok ? requiresStripe : false,
      ok,
      error: ok ? undefined : cls ? 'Not enough spaces' : 'Session unavailable',
    });
  }

  const totalOnline = out.reduce((s, l) => s + (l.ok ? l.online_charge_pence : 0), 0);

  return {
    venue_id: venueId,
    lines: out,
    all_ok: out.every((l) => l.ok),
    requires_authentication: true,
    total_online_charge_pence: totalOnline,
  };
}
