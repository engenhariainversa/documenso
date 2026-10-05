import { describe, expect, it } from 'vitest';

import { applyCouponDiscount, getCouponUnavailableReason, isCouponDiscountValid, normalizeCouponCode } from './coupon';

const NOW = new Date('2026-10-05T12:00:00.000Z');

const COUPON = {
  isActive: true,
  validFrom: null,
  validUntil: null,
  maxRedemptions: null,
};

describe('normalizeCouponCode', () => {
  it('ignores case and surrounding spaces', () => {
    expect(normalizeCouponCode('  primeira-1 ')).toBe('PRIMEIRA-1');
  });
});

describe('applyCouponDiscount', () => {
  it('takes a fixed amount off, e.g. R$ 99,90 down to R$ 1,00', () => {
    expect(applyCouponDiscount({ discountType: 'AMOUNT_OFF', discountValue: 9890 }, 9990)).toEqual({
      amountCents: 100,
      discountCents: 9890,
    });
  });

  it('takes a percentage off, rounded to the cent', () => {
    expect(applyCouponDiscount({ discountType: 'PERCENT', discountValue: 15 }, 9990)).toEqual({
      amountCents: 8491,
      discountCents: 1499,
    });
  });

  it('never goes below one cent', () => {
    expect(applyCouponDiscount({ discountType: 'AMOUNT_OFF', discountValue: 20000 }, 9990)).toEqual({
      amountCents: 1,
      discountCents: 9989,
    });
  });
});

describe('isCouponDiscountValid', () => {
  it.each([
    [{ discountType: 'PERCENT', discountValue: 1 }, true],
    [{ discountType: 'PERCENT', discountValue: 99 }, true],
    [{ discountType: 'PERCENT', discountValue: 100 }, false],
    [{ discountType: 'PERCENT', discountValue: 0 }, false],
    [{ discountType: 'AMOUNT_OFF', discountValue: 9989 }, true],
    [{ discountType: 'AMOUNT_OFF', discountValue: 9990 }, false],
    [{ discountType: 'AMOUNT_OFF', discountValue: 1.5 }, false],
  ] as const)('%j is %s for R$ 99,90', (discount, expected) => {
    expect(isCouponDiscountValid(discount, 9990)).toBe(expected);
  });
});

describe('getCouponUnavailableReason', () => {
  it('accepts an active coupon without limits', () => {
    expect(getCouponUnavailableReason({ coupon: COUPON, redemptions: 1000, now: NOW })).toBeNull();
  });

  it('refuses an inactive coupon', () => {
    expect(getCouponUnavailableReason({ coupon: { ...COUPON, isActive: false }, redemptions: 0, now: NOW })).toBe(
      'INACTIVE',
    );
  });

  it('refuses a coupon before its start and from its end', () => {
    expect(
      getCouponUnavailableReason({
        coupon: { ...COUPON, validFrom: new Date(NOW.getTime() + 1) },
        redemptions: 0,
        now: NOW,
      }),
    ).toBe('NOT_STARTED');

    expect(getCouponUnavailableReason({ coupon: { ...COUPON, validUntil: NOW }, redemptions: 0, now: NOW })).toBe(
      'EXPIRED',
    );
  });

  it('refuses a coupon whose redemptions reached the limit', () => {
    const coupon = { ...COUPON, maxRedemptions: 1 };

    expect(getCouponUnavailableReason({ coupon, redemptions: 0, now: NOW })).toBeNull();
    expect(getCouponUnavailableReason({ coupon, redemptions: 1, now: NOW })).toBe('EXHAUSTED');
  });
});
