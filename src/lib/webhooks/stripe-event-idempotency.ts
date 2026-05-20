import type { SupabaseClient } from '@supabase/supabase-js';

export type StripeWebhookClaimResult = 'claimed' | 'already_processed' | 'concurrent';

/**
 * Claim a Stripe webhook event for processing.
 * Returns `already_processed` when a prior run completed successfully.
 * Returns `concurrent` when another worker holds the claim — caller should 500 so Stripe retries.
 */
export async function claimStripeWebhookEvent(
  supabase: SupabaseClient,
  stripeEventId: string,
  eventType: string,
  logPrefix = '[Stripe webhook]',
): Promise<StripeWebhookClaimResult> {
  const { data: existing, error: selectError } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle();

  if (selectError) {
    console.error(`${logPrefix} Failed to check event idempotency:`, selectError);
    throw selectError;
  }
  if (existing) return 'already_processed';

  const { error: insertError } = await supabase.from('webhook_events').insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
  });

  if (!insertError) return 'claimed';

  const code = (insertError as { code?: string }).code;
  if (code === '23505' || code === '409') {
    return 'concurrent';
  }

  console.error(`${logPrefix} Failed to claim event idempotency lock:`, insertError);
  throw insertError;
}

/** Release a failed claim so Stripe retries can re-process the event. */
export async function releaseStripeWebhookEvent(
  supabase: SupabaseClient,
  stripeEventId: string,
  logPrefix = '[Stripe webhook]',
): Promise<void> {
  const { error } = await supabase
    .from('webhook_events')
    .delete()
    .eq('stripe_event_id', stripeEventId);

  if (error) {
    console.error(`${logPrefix} Failed to release event idempotency lock:`, error);
  }
}
