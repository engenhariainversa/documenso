import { prisma } from '@documenso/prisma';
import type { CloudSubscriptionCharge } from '@prisma/client';
import { CloudSubscriptionChargeStatus } from '@prisma/client';
import { DateTime } from 'luxon';

import {
  CLOUD_BILLING_PROVIDER,
  CLOUD_CHECKOUT_REUSE_WINDOW_HOURS,
  CLOUD_SUBSCRIPTION_CURRENCY,
  CLOUD_SUBSCRIPTION_PRICE_CENTS,
  IS_CLOUD_BILLING_ENABLED,
  IS_CLOUD_BILLING_PROVIDER_CONFIGURED,
} from '../../constants/cloud-billing';
import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  applyCouponDiscount,
  getCouponUnavailableReason,
  normalizeCouponCode,
  type TCouponUnavailableReason,
} from '../../universal/cloud-billing/coupon';
import { createOpapingouCharge } from './providers/opapingou/opapingou-client';

const CHARGE_DESCRIPTION = 'Docverse Cloud - assinatura mensal';

/**
 * How long a charge that never got its provider id is considered still in flight.
 * Longer than the provider timeout, so a slow request is never raced.
 */
const IN_FLIGHT_CHARGE_MINUTES = 2;

/**
 * Error codes of a coupon that cannot be applied, e.g. `COUPON_EXPIRED`.
 */
export type TCloudCheckoutCouponErrorCode = `COUPON_${TCouponUnavailableReason | 'NOT_FOUND'}`;

export type TCloudCheckoutCharge = {
  id: string;
  amountCents: number;
  discountCents: number;
  couponCode: string | null;
  currency: string;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type CreateCloudSubscriptionCheckoutOptions = {
  organisationId: string;
  userId: number;

  /**
   * Give up on the pending charge and create a new one, e.g. when its Pix code no
   * longer works. The replaced charge is still honoured if it ends up being paid.
   */
  isReplacement?: boolean;

  /**
   * A discount code typed by the user. A pending charge with another coupon (or
   * none) is replaced. Without a code, a replacement keeps the coupon of the charge
   * it replaces.
   */
  couponCode?: string;
  now?: Date;
};

/**
 * Start the checkout of one month of Docverse Cloud for an organisation.
 *
 * Hands back the pending charge when there is one, so asking twice never creates
 * two charges at the provider.
 *
 * The caller is responsible for checking that the user may manage billing.
 */
export const createCloudSubscriptionCheckout = async ({
  organisationId,
  userId,
  isReplacement = false,
  couponCode,
  now = new Date(),
}: CreateCloudSubscriptionCheckoutOptions): Promise<TCloudCheckoutCharge> => {
  if (!IS_CLOUD_BILLING_ENABLED()) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Cloud billing is not enabled',
    });
  }

  // Without the webhook secret no payment notification would ever be accepted, so refuse to charge.
  if (!IS_CLOUD_BILLING_PROVIDER_CONFIGURED()) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'Payment provider is not configured',
    });
  }

  const { charge, isReused } = await findOrCreatePendingCharge({
    organisationId,
    userId,
    isReplacement,
    couponCode: couponCode?.trim() ? normalizeCouponCode(couponCode) : null,
    now,
  });

  if (isReused) {
    return mapChargeToCheckout(charge);
  }

  // Our charge id is the idempotency key: a retried request cannot create a second
  // charge at the provider. The provider has no field for an external reference.
  const providerCharge = await createOpapingouCharge({
    amountCents: charge.amountCents,
    description: CHARGE_DESCRIPTION,
    idempotencyKey: charge.id,
  }).catch(async (err) => {
    await prisma.cloudSubscriptionCharge.deleteMany({
      where: {
        id: charge.id,
        status: CloudSubscriptionChargeStatus.PENDING,
      },
    });

    throw err;
  });

  const updatedCharge = await prisma.cloudSubscriptionCharge.update({
    where: {
      id: charge.id,
    },
    data: {
      providerChargeId: providerCharge.providerChargeId,
      paymentUrl: providerCharge.paymentUrl,
      pixCopyPaste: providerCharge.pixCopyPaste,
      expiresAt: providerCharge.expiresAt,
    },
    include: CHARGE_COUPON_INCLUDE,
  });

  return mapChargeToCheckout(updatedCharge);
};

export const CHARGE_COUPON_INCLUDE = {
  coupon: {
    select: {
      code: true,
    },
  },
} as const;

type TChargeWithCoupon = CloudSubscriptionCharge & { coupon: { code: string } | null };

export const mapChargeToCheckout = (charge: TChargeWithCoupon): TCloudCheckoutCharge => ({
  id: charge.id,
  amountCents: charge.amountCents,
  discountCents: charge.discountCents,
  couponCode: charge.coupon?.code ?? null,
  currency: charge.currency,
  paymentUrl: charge.paymentUrl,
  pixCopyPaste: charge.pixCopyPaste,
  expiresAt: charge.expiresAt,
  createdAt: charge.createdAt,
});

/**
 * The oldest creation date a pending charge can have and still be offered to the user.
 */
export const getCheckoutReuseCutoff = (now: Date) => {
  return DateTime.fromJSDate(now, { zone: 'utc' }).minus({ hours: CLOUD_CHECKOUT_REUSE_WINDOW_HOURS }).toJSDate();
};

type FindOrCreatePendingChargeOptions = {
  organisationId: string;
  userId: number;
  isReplacement: boolean;

  /**
   * Already normalised.
   */
  couponCode: string | null;
  now: Date;
};

type TTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * The charges that hold a redemption of a coupon: paid ones, and pending ones that
 * can still be paid. A pending charge whose Pix code expired frees its place even
 * before it is marked EXPIRED (that only happens on the next checkout of its
 * organisation). If it is paid anyway, the payment is still honoured.
 */
export const getCouponRedemptionWhere = (now: Date) => ({
  OR: [
    {
      status: CloudSubscriptionChargeStatus.PAID,
    },
    {
      status: CloudSubscriptionChargeStatus.PENDING,
      createdAt: {
        gt: getCheckoutReuseCutoff(now),
      },
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
  ],
});

/**
 * Checks the coupon under its own lock, so two organisations cannot both take its
 * last redemption.
 */
const reserveCoupon = async (tx: TTransaction, where: { code: string } | { id: string }, now: Date) => {
  const coupon = await tx.cloudBillingCoupon.findUnique({ where });

  if (!coupon) {
    throw new AppError('COUPON_NOT_FOUND' satisfies TCloudCheckoutCouponErrorCode, {
      message: 'Coupon not found',
    });
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cloud-billing-coupon:${coupon.id}`}))`;

  const redemptions = await tx.cloudSubscriptionCharge.count({
    where: {
      couponId: coupon.id,
      ...getCouponRedemptionWhere(now),
    },
  });

  const reason = getCouponUnavailableReason({ coupon, redemptions, now });

  if (reason) {
    throw new AppError(`COUPON_${reason}` satisfies TCloudCheckoutCouponErrorCode, {
      message: `Coupon cannot be used: ${reason}`,
    });
  }

  return coupon;
};

/**
 * Runs under a per-organisation lock, so two checkouts started at the same time
 * cannot both decide that there is no pending charge.
 *
 * The provider is called outside of this transaction to keep the lock short.
 */
const findOrCreatePendingCharge = async ({
  organisationId,
  userId,
  isReplacement,
  couponCode,
  now,
}: FindOrCreatePendingChargeOptions) => {
  const inFlightCutoff = DateTime.fromJSDate(now, { zone: 'utc' })
    .minus({ minutes: IN_FLIGHT_CHARGE_MINUTES })
    .toJSDate();

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cloud-billing-checkout:${organisationId}`}))`;

    const currentPending = await tx.cloudSubscriptionCharge.findFirst({
      where: {
        organisationId,
        status: CloudSubscriptionChargeStatus.PENDING,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: CHARGE_COUPON_INCLUDE,
    });

    // A different coupon (or a coupon where there was none) needs a new charge.
    const isCouponChange = couponCode !== null && currentPending?.coupon?.code !== couponCode;

    // A replacement without a code keeps the discount of the charge it replaces.
    const carriedCouponId = isReplacement && couponCode === null ? (currentPending?.couponId ?? null) : null;

    const isRetiringPending = isReplacement || isCouponChange;

    // Charges abandoned before the provider answered, e.g. the server stopped mid-request.
    await tx.cloudSubscriptionCharge.deleteMany({
      where: {
        organisationId,
        status: CloudSubscriptionChargeStatus.PENDING,
        providerChargeId: null,
        createdAt: {
          lte: inFlightCutoff,
        },
      },
    });

    await tx.cloudSubscriptionCharge.updateMany({
      where: {
        organisationId,
        status: CloudSubscriptionChargeStatus.PENDING,
        providerChargeId: {
          not: null,
        },
        // A replacement retires every pending charge, not only the stale ones.
        OR: isRetiringPending
          ? undefined
          : [
              {
                expiresAt: {
                  lte: now,
                },
              },
              {
                createdAt: {
                  lte: getCheckoutReuseCutoff(now),
                },
              },
            ],
      },
      data: {
        status: CloudSubscriptionChargeStatus.EXPIRED,
      },
    });

    const pendingCharge = await tx.cloudSubscriptionCharge.findFirst({
      where: {
        organisationId,
        status: CloudSubscriptionChargeStatus.PENDING,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: CHARGE_COUPON_INCLUDE,
    });

    if (pendingCharge && pendingCharge.providerChargeId === null) {
      throw new AppError(AppErrorCode.ALREADY_EXISTS, {
        message: 'A checkout is already being created for this organisation',
      });
    }

    if (pendingCharge) {
      return {
        charge: pendingCharge,
        isReused: true,
      };
    }

    const couponWhere = couponCode !== null ? { code: couponCode } : carriedCouponId ? { id: carriedCouponId } : null;

    const coupon = couponWhere ? await reserveCoupon(tx, couponWhere, now) : null;

    const { amountCents, discountCents } = coupon
      ? applyCouponDiscount(coupon, CLOUD_SUBSCRIPTION_PRICE_CENTS)
      : { amountCents: CLOUD_SUBSCRIPTION_PRICE_CENTS, discountCents: 0 };

    const charge = await tx.cloudSubscriptionCharge.create({
      data: {
        createdAt: now,
        organisationId,
        createdByUserId: userId,
        provider: CLOUD_BILLING_PROVIDER,
        amountCents,
        discountCents,
        couponId: coupon?.id ?? null,
        currency: CLOUD_SUBSCRIPTION_CURRENCY,
      },
      include: CHARGE_COUPON_INCLUDE,
    });

    return {
      charge,
      isReused: false,
    };
  });
};
