import { describe, expect, it } from 'vitest';

import { isPaymentConfirmed } from './payment-confirmation';

const PENDING_CHARGE = { id: 'charge_1' };

describe('isPaymentConfirmed', () => {
  it('confirms the first payment', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: null, pendingCharge: PENDING_CHARGE },
      after: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: null },
    });

    expect(isConfirmed).toBe(true);
  });

  it('confirms a renewal when the period moved forward', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: PENDING_CHARGE },
      after: { currentPeriodEnd: new Date('2026-12-15T00:00:00.000Z'), pendingCharge: null },
    });

    expect(isConfirmed).toBe(true);
  });

  it('does not confirm an early renewal that was not paid, although the plan is active', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: PENDING_CHARGE },
      after: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: PENDING_CHARGE },
    });

    expect(isConfirmed).toBe(false);
  });

  it('does not confirm when nothing changed for an organisation without a plan', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: null, pendingCharge: PENDING_CHARGE },
      after: { currentPeriodEnd: null, pendingCharge: PENDING_CHARGE },
    });

    expect(isConfirmed).toBe(false);
  });

  it('does not confirm when the pending charge only expired', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: PENDING_CHARGE },
      after: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: null },
    });

    expect(isConfirmed).toBe(false);
  });

  it('does not confirm when there was no payment being waited for', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: null, pendingCharge: null },
      after: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: null },
    });

    expect(isConfirmed).toBe(false);
  });

  it('confirms when the period moved forward and a newer charge is already pending', () => {
    const isConfirmed = isPaymentConfirmed({
      before: { currentPeriodEnd: null, pendingCharge: PENDING_CHARGE },
      after: { currentPeriodEnd: new Date('2026-11-15T00:00:00.000Z'), pendingCharge: { id: 'charge_2' } },
    });

    expect(isConfirmed).toBe(true);
  });
});
