import type Stripe from 'stripe';

/**
 * Metered SMS overage price (Stripe Dashboard → Products → metered £0.05).
 * Not required for core app; SMS logging still works without billing overages.
 */
export function getStripeSmsOveragePriceId(): string | undefined {
  const id = process.env.STRIPE_SMS_OVERAGE_PRICE_ID?.trim();
  return id || undefined;
}

function priceIdOf(item: Stripe.SubscriptionItem): string | undefined {
  const p = item.price;
  if (!p) return undefined;
  return typeof p === 'string' ? p : p.id;
}

/** Subscription line item for the main plan recurring price (quantity updates). */
export function findMainPlanSubscriptionItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const knownPriceIds = [
    process.env.STRIPE_STANDARD_PRICE_ID?.trim(),
    process.env.STRIPE_BUSINESS_PRICE_ID?.trim(),
    process.env.STRIPE_APPOINTMENTS_PRICE_ID?.trim(),
    process.env.STRIPE_RESTAURANT_PRICE_ID?.trim(),
  ].filter(Boolean) as string[];
  for (const item of sub.items.data) {
    const pid = priceIdOf(item);
    if (pid && knownPriceIds.includes(pid)) {
      return item;
    }
  }
  for (const item of sub.items.data) {
    const p = item.price;
    if (typeof p === 'object' && p && 'recurring' in p && p.recurring?.usage_type === 'metered') {
      continue;
    }
    return item;
  }
  return sub.items.data[0];
}

/** Metered line item used for SMS overage usage records. */
export function findSmsMeteredSubscriptionItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const smsPrice = getStripeSmsOveragePriceId();
  if (!smsPrice) return undefined;
  for (const item of sub.items.data) {
    const pid = priceIdOf(item);
    if (pid === smsPrice) return item;
  }
  return undefined;
}

export interface PersistedSubscriptionItemIds {
  mainSubscriptionItemId: string | null;
  smsSubscriptionItemId: string | null;
}

export function getPersistedSubscriptionItemIds(sub: Stripe.Subscription): PersistedSubscriptionItemIds {
  return {
    mainSubscriptionItemId: findMainPlanSubscriptionItem(sub)?.id ?? null,
    smsSubscriptionItemId: findSmsMeteredSubscriptionItem(sub)?.id ?? null,
  };
}

/**
 * Checkout line items: main plan + optional metered SMS price.
 * Metered prices are added without quantity (Stripe bills on reported usage).
 */
export function buildCheckoutLineItems(mainPriceId: string, mainQuantity: number): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const sms = getStripeSmsOveragePriceId();
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: mainPriceId, quantity: mainQuantity },
  ];
  if (sms) {
    items.push({ price: sms });
  }
  return items;
}

/**
 * When updating the main plan line item, include the metered SMS item so Stripe does not drop it.
 * If STRIPE_SMS_OVERAGE_PRICE_ID is set and the subscription has no metered line yet, attach it.
 */
export function buildSubscriptionItemsForPlanChange(
  existing: Stripe.Subscription,
  mainItemUpdate: { id: string; price: string; quantity?: number }
): Stripe.SubscriptionUpdateParams.Item[] {
  const items: Stripe.SubscriptionUpdateParams.Item[] = [mainItemUpdate];
  const smsPrice = getStripeSmsOveragePriceId();
  if (!smsPrice) {
    return items;
  }
  const smsItem = findSmsMeteredSubscriptionItem(existing);
  if (smsItem?.id) {
    items.push({ id: smsItem.id });
  } else {
    items.push({ price: smsPrice });
  }
  return items;
}
