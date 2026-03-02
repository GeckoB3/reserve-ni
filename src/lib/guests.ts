/**
 * Guest identity matching: find or create guest by email/phone per venue.
 * Order: email match (normalised), then phone match (E.164), else create new.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Simple E.164-ish: digits only, ensure leading + for storage. Not full validation. */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('44')) return '+' + digits;
  if (digits.length >= 10) return '+44' + digits.replace(/^0/, '');
  return '+' + digits;
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
 * Increments visit_count when matching existing guest.
 */
export async function findOrCreateGuest(
  supabase: SupabaseClient,
  venueId: string,
  input: GuestInput
): Promise<{ guest: GuestRecord; created: boolean }> {
  const email = input.email ? normaliseEmail(input.email) : null;
  const phone = input.phone ? normalisePhone(input.phone) : null;
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
          visit_count: byEmail.visit_count + 1,
          name: name ?? byEmail.name,
          phone: phone ?? byEmail.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', byEmail.id);

      if (!updErr) {
        return {
          guest: { ...byEmail, visit_count: byEmail.visit_count + 1, name: name ?? byEmail.name, phone: phone ?? byEmail.phone },
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
          visit_count: byPhone.visit_count + 1,
          name: name ?? byPhone.name,
          email: email ?? byPhone.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', byPhone.id);

      if (!updErr) {
        return {
          guest: { ...byPhone, visit_count: byPhone.visit_count + 1, name: name ?? byPhone.name, email: email ?? byPhone.email },
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
      global_guest_hash: null,
      visit_count: 1,
    })
    .select('id, venue_id, name, email, phone, visit_count')
    .single();

  if (insertErr) throw insertErr;
  return { guest: inserted as GuestRecord, created: true };
}
