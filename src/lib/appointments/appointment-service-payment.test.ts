import { describe, expect, it } from 'vitest';
import { resolveAppointmentServiceOnlineCharge } from './appointment-service-payment';

describe('resolveAppointmentServiceOnlineCharge', () => {
  it('returns null for none', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({
        payment_requirement: 'none',
        deposit_pence: 500,
        price_pence: 2000,
      }),
    ).toBeNull();
  });

  it('uses deposit_pence for deposit mode', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({
        payment_requirement: 'deposit',
        deposit_pence: 500,
        price_pence: 2000,
      }),
    ).toEqual({ amountPence: 500, chargeLabel: 'deposit' });
  });

  it('uses price for full_payment mode', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({
        payment_requirement: 'full_payment',
        deposit_pence: 0,
        price_pence: 2000,
      }),
    ).toEqual({ amountPence: 2000, chargeLabel: 'full_payment' });
  });

  it('infers deposit from legacy deposit_pence when payment_requirement missing', () => {
    expect(
      resolveAppointmentServiceOnlineCharge({
        payment_requirement: undefined,
        deposit_pence: 300,
        price_pence: null,
      }),
    ).toEqual({ amountPence: 300, chargeLabel: 'deposit' });
  });
});
