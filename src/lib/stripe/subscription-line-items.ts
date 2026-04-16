import type Stripe from 'stripe';

/**
 * Metered SMS overage price (Stripe Dashboard → Products → metered £0.05).
 * Not required for core app; SMS logging still works without billing overages.
 */
export function getStripeSmsOveragePriceId(): string | undefined {
  const id = process.env.STRIPE_SMS_OVERAGE_PRICE_ID?.trim();
  return id || undefined;
}

export function getStripeSmsLightPriceId(): string | undefined {
  const id = process.env.STRIPE_SMS_LIGHT_PRICE_ID?.trim();
  return id || undefined;
}

export function getStripeLightPlanPriceId(): string | undefined {
  const id = process.env.STRIPE_LIGHT_PRICE_ID?.trim();
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
    process.env.STRIPE_APPOINTMENTS_PRICE_ID?.trim(),
    process.env.STRIPE_RESTAURANT_PRICE_ID?.trim(),
    process.env.STRIPE_LIGHT_PRICE_ID?.trim(),
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

/** Metered line item used for SMS overage usage records (6p or Light 8p). */
export function findSmsMeteredSubscriptionItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const candidates = [
    getStripeSmsOveragePriceId(),
    getStripeSmsLightPriceId(),
  ].filter(Boolean) as string[];
  if (candidates.length === 0) return undefined;
  for (const item of sub.items.data) {
    const pid = priceIdOf(item);
    if (pid && candidates.includes(pid)) return item;
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
 * Appointments Light Checkout: flat £5 (deferred via subscription trial in API/webhook) + metered SMS at 8p.
 * Quantity only applies to the main recurring price.
 */
export function buildLightPlanCheckoutLineItems(mainQuantity: number): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const main = getStripeLightPlanPriceId();
  const smsLight = getStripeSmsLightPriceId();
  if (!main?.trim()) {
    throw new Error('STRIPE_LIGHT_PRICE_ID is not configured');
  }
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: main.trim(), quantity: mainQuantity },
  ];
  if (smsLight?.trim()) {
    items.push({ price: smsLight.trim() });
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
