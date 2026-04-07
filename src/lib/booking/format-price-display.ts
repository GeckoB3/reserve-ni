/**
 * Guest/staff booking surfaces: treat null or ≤0 pence as free (no POA for intentional free pricing).
 */

export function isFreePricePence(pence: number | null | undefined): boolean {
  return pence == null || pence <= 0;
}

/** One-line price for service/resource pickers (not "From …"). */
export function formatBookablePricePence(pence: number | null | undefined, currencySymbol: string): string {
  if (isFreePricePence(pence)) return 'Free';
  return `${currencySymbol}${(Number(pence) / 100).toFixed(2)}`;
}

/** Minimum price across practitioners ("From …"). */
export function formatFromBookablePricePence(pence: number | null | undefined, currencySymbol: string): string {
  if (isFreePricePence(pence)) return 'Free';
  return `From ${currencySymbol}${(Number(pence) / 100).toFixed(2)}`;
}

/** Resource: "£x per slot" or Free. */
export function formatResourcePricePerSlotLine(
  pricePerSlotPence: number | null | undefined,
  currencySymbol: string,
  intervalLabel: string,
): string {
  if (isFreePricePence(pricePerSlotPence)) return 'Free';
  return `${currencySymbol}${(Number(pricePerSlotPence) / 100).toFixed(2)} per ${intervalLabel}`;
}

/**
 * Dashboard service catalog: distinguish unset (—) from free (£0) vs priced.
 */
export function formatPricePenceForServiceCatalog(pence: number | null | undefined, currencySymbol: string): string {
  if (pence == null) return '—';
  if (pence <= 0) return 'Free';
  return `${currencySymbol}${(pence / 100).toFixed(2)}`;
}
