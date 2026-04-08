import type { BookingModel } from '@/types/booking-models';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import { isAppointmentPlanTier, isRestaurantTableProductTier } from '@/lib/tier-enforcement';

export const APPOINTMENTS_ACTIVE_MODEL_ORDER: BookingModel[] = [
  'unified_scheduling',
  'class_session',
  'event_ticket',
  'resource_booking',
];

export const VENUE_ACTIVE_MODEL_ORDER: BookingModel[] = [
  'table_reservation',
  ...APPOINTMENTS_ACTIVE_MODEL_ORDER,
];

const ACTIVE_MODEL_SET = new Set<BookingModel>(VENUE_ACTIVE_MODEL_ORDER);

function normalizeActiveBookingModelValue(value: unknown): BookingModel | null {
  if (value === 'practitioner_appointment') {
    return 'unified_scheduling';
  }
  if (typeof value !== 'string') {
    return null;
  }
  return ACTIVE_MODEL_SET.has(value as BookingModel) ? (value as BookingModel) : null;
}

export function normalizeActiveBookingModels(raw: unknown): BookingModel[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<BookingModel>();
  const models: BookingModel[] = [];
  for (const item of raw) {
    const model = normalizeActiveBookingModelValue(item);
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    models.push(model);
  }

  models.sort(
    (left, right) => VENUE_ACTIVE_MODEL_ORDER.indexOf(left) - VENUE_ACTIVE_MODEL_ORDER.indexOf(right),
  );
  return models;
}

export function appointmentPlanDefaultModels(): BookingModel[] {
  return ['unified_scheduling'];
}

export function isAppointmentsSelectableModel(model: BookingModel): boolean {
  return APPOINTMENTS_ACTIVE_MODEL_ORDER.includes(model);
}

export interface ResolveActiveBookingModelsInput {
  pricingTier?: string | null;
  bookingModel?: BookingModel | string | null;
  enabledModels?: unknown;
  activeBookingModels?: unknown;
}

export function resolveActiveBookingModels(input: ResolveActiveBookingModelsInput): BookingModel[] {
  const explicit = normalizeActiveBookingModels(input.activeBookingModels);
  if (Array.isArray(input.activeBookingModels)) {
    if (explicit.length > 0) {
      return explicit;
    }
    // Empty array: appointments tier means "models not chosen yet" after payment.
    if (isAppointmentPlanTier(input.pricingTier)) {
      return [];
    }
    // Otherwise treat as unset (e.g. DB default [] before backfill) and derive from legacy fields.
  }

  const normalizedPrimary = normalizeActiveBookingModelValue(input.bookingModel) ?? 'table_reservation';
  const normalizedEnabled = normalizeEnabledModels(input.enabledModels, normalizedPrimary);

  if (isRestaurantTableProductTier(input.pricingTier)) {
    return normalizeActiveBookingModels([normalizedPrimary, ...normalizedEnabled]);
  }

  if (isAppointmentPlanTier(input.pricingTier)) {
    const derived = normalizeActiveBookingModels([normalizedPrimary, ...normalizedEnabled]).filter(
      isAppointmentsSelectableModel,
    );
    return derived.length > 0 ? derived : appointmentPlanDefaultModels();
  }

  return normalizeActiveBookingModels([normalizedPrimary, ...normalizedEnabled]);
}

export function getDefaultBookingModelFromActive(
  activeModels: BookingModel[],
  fallback: BookingModel = 'table_reservation',
): BookingModel {
  return activeModels[0] ?? fallback;
}

export function activeModelsToLegacyEnabledModels(activeModels: BookingModel[], bookingModel: BookingModel): BookingModel[] {
  return normalizeActiveBookingModels(activeModels).filter((model) => model !== bookingModel);
}

export function venueSupportsBookingModel(activeModels: BookingModel[], model: BookingModel): boolean {
  return activeModels.includes(model);
}
