import type { AppointmentService } from '@/types/booking-models';
import type { ClassPaymentRequirement } from '@/types/booking-models';

/** Fields sufficient to compute online charge (e.g. catalog offer or merged service). */
export type AppointmentServicePaymentFields = Pick<
  AppointmentService,
  'payment_requirement' | 'deposit_pence' | 'price_pence'
>;

/**
 * Effective payment mode for a service row (handles pre-migration rows that only had deposit_pence).
 */
export function resolveAppointmentPaymentRequirement(
  svc: Pick<AppointmentService, 'payment_requirement' | 'deposit_pence'>,
): ClassPaymentRequirement {
  const raw = svc.payment_requirement;
  if (raw === 'deposit' || raw === 'full_payment' || raw === 'none') return raw;
  if (svc.deposit_pence != null && svc.deposit_pence > 0) return 'deposit';
  return 'none';
}

export type AppointmentOnlineCharge =
  | { amountPence: number; chargeLabel: 'deposit' | 'full_payment' }
  | null;

/**
 * Amount to collect online at booking for this service (after venue + practitioner merge).
 */
export function resolveAppointmentServiceOnlineCharge(svc: AppointmentServicePaymentFields): AppointmentOnlineCharge {
  const req = resolveAppointmentPaymentRequirement(svc);
  const price = svc.price_pence ?? 0;
  const dep = svc.deposit_pence ?? 0;
  if (req === 'none') return null;
  if (req === 'full_payment') {
    if (price <= 0) return null;
    return { amountPence: price, chargeLabel: 'full_payment' };
  }
  if (dep <= 0) return null;
  return { amountPence: dep, chargeLabel: 'deposit' };
}
