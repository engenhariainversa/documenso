import { prisma } from '@documenso/prisma';
import type { CloudBillingCoupon } from '@prisma/client';
import { CloudSubscriptionChargeStatus } from '@prisma/client';

import { CLOUD_SUBSCRIPTION_PRICE_CENTS } from '../../../constants/cloud-billing';
import { AppError, AppErrorCode } from '../../../errors/app-error';
import {
  applyCouponDiscount,
  COUPON_CODE_REGEX,
  isCouponDiscountValid,
  normalizeCouponCode,
  type TCouponDiscountType,
} from '../../../universal/cloud-billing/coupon';
import { getCouponRedemptionWhere } from '../create-checkout';

const PRISMA_UNIQUE_VIOLATION_CODE = 'P2002';

export type TAdminCloudBillingCoupon = CloudBillingCoupon & {
  /** Charges with the coupon that were paid. */
  paidRedemptions: number;

  /** Charges with the coupon that can still be paid. They hold a redemption. */
  pendingRedemptions: number;

  /** What the plan costs with the coupon today. */
  finalAmountCents: number;
};

export type CreateCloudBillingCouponOptions = {
  code: string;
  description?: string;
  discountType: TCouponDiscountType;
  discountValue: number;
  validFrom?: Date | null;
  validUntil?: Date | null;
  maxRedemptions?: number | null;
  createdByUserId?: number;
};

const assertValidCouponRules = ({
  discountType,
  discountValue,
  validFrom,
  validUntil,
}: Pick<CreateCloudBillingCouponOptions, 'discountType' | 'discountValue' | 'validFrom' | 'validUntil'>) => {
  if (!isCouponDiscountValid({ discountType, discountValue }, CLOUD_SUBSCRIPTION_PRICE_CENTS)) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'The discount must leave at least one cent to pay',
    });
  }

  if (validFrom && validUntil && validFrom >= validUntil) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'The coupon must start before it ends',
    });
  }
};

export const createCloudBillingCoupon = async ({
  code,
  description = '',
  discountType,
  discountValue,
  validFrom = null,
  validUntil = null,
  maxRedemptions = null,
  createdByUserId,
}: CreateCloudBillingCouponOptions) => {
  const normalizedCode = normalizeCouponCode(code);

  if (!COUPON_CODE_REGEX.test(normalizedCode)) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Use 3 to 32 letters, digits, "-" or "_"',
    });
  }

  assertValidCouponRules({ discountType, discountValue, validFrom, validUntil });

  return await prisma.cloudBillingCoupon
    .create({
      data: {
        code: normalizedCode,
        description: description.trim(),
        discountType,
        discountValue,
        validFrom,
        validUntil,
        maxRedemptions,
        createdByUserId,
      },
    })
    .catch((err) => {
      if (err?.code === PRISMA_UNIQUE_VIOLATION_CODE) {
        throw new AppError(AppErrorCode.ALREADY_EXISTS, {
          message: 'A coupon with this code already exists',
        });
      }

      throw err;
    });
};

export type UpdateCloudBillingCouponOptions = {
  id: string;
  description?: string;
  isActive?: boolean;
  validFrom?: Date | null;
  validUntil?: Date | null;
  maxRedemptions?: number | null;
};

/**
 * The code and the discount never change: charges already made with the coupon
 * must keep meaning what they meant. Create another coupon instead.
 */
export const updateCloudBillingCoupon = async ({ id, ...data }: UpdateCloudBillingCouponOptions) => {
  const coupon = await prisma.cloudBillingCoupon.findUnique({ where: { id } });

  if (!coupon) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Coupon not found',
    });
  }

  assertValidCouponRules({
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    validFrom: data.validFrom === undefined ? coupon.validFrom : data.validFrom,
    validUntil: data.validUntil === undefined ? coupon.validUntil : data.validUntil,
  });

  return await prisma.cloudBillingCoupon.update({
    where: { id },
    data: {
      ...data,
      description: data.description?.trim(),
    },
  });
};

export const findCloudBillingCoupons = async (now = new Date()): Promise<TAdminCloudBillingCoupon[]> => {
  const [coupons, counts] = await Promise.all([
    prisma.cloudBillingCoupon.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.cloudSubscriptionCharge.groupBy({
      by: ['couponId', 'status'],
      where: {
        couponId: {
          not: null,
        },
        ...getCouponRedemptionWhere(now),
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const countOf = (couponId: string, status: CloudSubscriptionChargeStatus) =>
    counts.find((count) => count.couponId === couponId && count.status === status)?._count._all ?? 0;

  return coupons.map((coupon) => ({
    ...coupon,
    paidRedemptions: countOf(coupon.id, CloudSubscriptionChargeStatus.PAID),
    pendingRedemptions: countOf(coupon.id, CloudSubscriptionChargeStatus.PENDING),
    finalAmountCents: applyCouponDiscount(coupon, CLOUD_SUBSCRIPTION_PRICE_CENTS).amountCents,
  }));
};
