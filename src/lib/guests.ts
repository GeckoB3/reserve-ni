/**
 * Guest identity matching: find or create guest by email/phone per venue.
 * Order: email match (normalised), then phone match (E.164), else create new.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { normalizeToE164, normalizeToE164Lenient } from '@/lib/phone/e164';

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** E.164 for storage and matching; strict first, then lenient for legacy rows. */
function normaliseGuestPhone(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  return normalizeToE164(t, 'GB') ?? normalizeToE164Lenient(t, 'GB');
}

function computeGlobalGuestHash(email: string | null, phone: string | null): string | null {
  if (!email && !phone) return null;
  const base = `${email ?? ''}|${phone ?? ''}`;
  return createHash('sha256').update(base).digest('hex');
}

export interface GuestInput {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface GuestRecord {
  id: string;
  venue_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  visit_count: number;
}

/**
 * Find or create a guest for the venue. Match by email first, then phone, else insert.
 * visit_count is NOT incremented here — it's incremented when status changes to Seated.
 */
export async function findOrCreateGuest(
  supabase: SupabaseClient,
  venueId: string,
  input: GuestInput
): Promise<{ guest: GuestRecord; created: boolean }> {
  const email = input.email ? normaliseEmail(input.email) : null;
  const phone = input.phone ? normaliseGuestPhone(input.phone) : null;
  const name = input.name?.trim() || null;

  if (email) {
    const { data: byEmail } = await supabase
      .from('guests')
      .select('id, venue_id, name, email, phone, visit_count')
      .eq('venue_id', venueId)
      .eq('email', email)
      .maybeSingle();

    if (byEmail) {
      const { error: updErr } = await supabase
        .from('guests')
        .update({
          name: name ?? byEmail.name,
          phone: phone ?? byEmail.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', byEmail.id);

      if (!updErr) {
        return {
          guest: { ...byEmail, name: name ?? byEmail.name, phone: phone ?? byEmail.phone },
          created: false,
        };
      }
    }
  }

  if (phone) {
    const { data: byPhone } = await supabase
      .from('guests')
      .select('id, venue_id, name, email, phone, visit_count')
      .eq('venue_id', venueId)
      .eq('phone', phone)
      .maybeSingle();

    if (byPhone) {
      const { error: updErr } = await supabase
        .from('guests')
        .update({
          name: name ?? byPhone.name,
          email: email ?? byPhone.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', byPhone.id);

      if (!updErr) {
        return {
          guest: { ...byPhone, name: name ?? byPhone.name, email: email ?? byPhone.email },
          created: false,
        };
      }
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('guests')
    .insert({
      venue_id: venueId,
      name,
      email: email || null,
      phone: phone || null,
      global_guest_hash: computeGlobalGuestHash(email, phone),
      visit_count: 0,
    })
    .select('id, venue_id, name, email, phone, visit_count')
    .single();

  if (insertErr) throw insertErr;
  return { guest: inserted as GuestRecord, created: true };
}
