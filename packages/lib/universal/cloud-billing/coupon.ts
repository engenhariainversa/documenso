/**
 * Discount coupons of the Docverse Cloud checkout.
 *
 * Kept free of Prisma so the admin page can preview the final price with the same
 * rules the checkout applies.
 */
export const COUPON_CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;

/**
 * The provider refuses charges below one cent (Opa Pingou `MIN_CHARGE_CENTS`).
 */
export const MIN_CHARGE_AMOUNT_CENTS = 1;

export type TCouponDiscountType = 'PERCENT' | 'AMOUNT_OFF';

export type TCouponDiscount = {
  discountType: TCouponDiscountType;

  /**
   * Percent (1-99) for PERCENT, cents for AMOUNT_OFF.
   */
  discountValue: number;
};

/**
 * Codes are typed by people: case and surrounding spaces do not matter.
 */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

/**
 * Whether the discount leaves a chargeable amount for this list price. A coupon
 * never makes the plan free: the first real charge still goes through Pix.
 */
export const isCouponDiscountValid = ({ discountType, discountValue }: TCouponDiscount, listPriceCents: number) => {
  if (!Number.isSafeInteger(discountValue) || discountValue < 1) {
    return false;
  }

  if (discountType === 'PERCENT') {
    return discountValue <= 99;
  }

  return listPriceCents - discountValue >= MIN_CHARGE_AMOUNT_CENTS;
};

/**
 * The amount charged with the coupon, never below the provider minimum.
 */
export const applyCouponDiscount = (discount: TCouponDiscount, listPriceCents: number) => {
  const rawDiscountCents =
    discount.discountType === 'PERCENT'
      ? Math.round((listPriceCents * discount.discountValue) / 100)
      : discount.discountValue;

  const amountCents = Math.max(MIN_CHARGE_AMOUNT_CENTS, listPriceCents - rawDiscountCents);

  return {
    amountCents,
    discountCents: listPriceCents - amountCents,
  };
};

export type TCouponUnavailableReason = 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'EXHAUSTED';

export type GetCouponUnavailableReasonOptions = {
  coupon: {
    isActive: boolean;
    validFrom: Date | null;
    validUntil: Date | null;
    maxRedemptions: number | null;
  };

  /**
   * Charges with the coupon that are paid or still pending.
   */
  redemptions: number;
  now: Date;
};

/**
 * Why a coupon cannot be used right now, or null when it can.
 */
export const getCouponUnavailableReason = ({
  coupon,
  redemptions,
  now,
}: GetCouponUnavailableReasonOptions): TCouponUnavailableReason | null => {
  if (!coupon.isActive) {
    return 'INACTIVE';
  }

  if (coupon.validFrom && now < coupon.validFrom) {
    return 'NOT_STARTED';
  }

  if (coupon.validUntil && now >= coupon.validUntil) {
    return 'EXPIRED';
  }

  if (coupon.maxRedemptions !== null && redemptions >= coupon.maxRedemptions) {
    return 'EXHAUSTED';
  }

  return null;
};
