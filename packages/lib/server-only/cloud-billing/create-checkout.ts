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
import { createOpapingouCharge } from './providers/opapingou/opapingou-client';

const CHARGE_DESCRIPTION = 'Docverse Cloud - assinatura mensal';

/**
 * How long a charge that never got its provider id is considered still in flight.
 * Longer than the provider timeout, so a slow request is never raced.
 */
const IN_FLIGHT_CHARGE_MINUTES = 2;

export type TCloudCheckoutCharge = {
  id: string;
  amountCents: number;
  currency: string;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type CreateCloudSubscriptionCheckoutOptions = {
  organisationId: string;
  userId: number;
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
  now = new Date(),
}: CreateCloudSubscriptionCheckoutOptions): Promise<TCloudCheckoutCharge> => {
  if (!IS_CLOUD_BILLING_ENABLED()) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Cloud billing is not enabled',
    });
  }

  // Without the webhook secret a payment could never be confirmed, so refuse to charge.
  if (!IS_CLOUD_BILLING_PROVIDER_CONFIGURED()) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'Payment provider is not configured',
    });
  }

  const { charge, isReused } = await findOrCreatePendingCharge({ organisationId, userId, now });

  if (isReused) {
    return mapChargeToCheckout(charge);
  }

  const providerCharge = await createOpapingouCharge({
    amountCents: charge.amountCents,
    reference: charge.id,
    description: CHARGE_DESCRIPTION,
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
  });

  return mapChargeToCheckout(updatedCharge);
};

export const mapChargeToCheckout = (charge: CloudSubscriptionCharge): TCloudCheckoutCharge => ({
  id: charge.id,
  amountCents: charge.amountCents,
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
  now: Date;
};

/**
 * Runs under a per-organisation lock, so two checkouts started at the same time
 * cannot both decide that there is no pending charge.
 *
 * The provider is called outside of this transaction to keep the lock short.
 */
const findOrCreatePendingCharge = async ({ organisationId, userId, now }: FindOrCreatePendingChargeOptions) => {
  const inFlightCutoff = DateTime.fromJSDate(now, { zone: 'utc' })
    .minus({ minutes: IN_FLIGHT_CHARGE_MINUTES })
    .toJSDate();

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cloud-billing-checkout:${organisationId}`}))`;

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
        OR: [
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

    const charge = await tx.cloudSubscriptionCharge.create({
      data: {
        createdAt: now,
        organisationId,
        createdByUserId: userId,
        provider: CLOUD_BILLING_PROVIDER,
        amountCents: CLOUD_SUBSCRIPTION_PRICE_CENTS,
        currency: CLOUD_SUBSCRIPTION_CURRENCY,
      },
    });

    return {
      charge,
      isReused: false,
    };
  });
};
