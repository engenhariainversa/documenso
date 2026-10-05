import { prisma } from '@documenso/prisma';
import type { CloudSubscriptionCharge } from '@prisma/client';
import { CloudSubscriptionChargeStatus } from '@prisma/client';
import { DateTime } from 'luxon';

import {
  CLOUD_BILLING_PROVIDER,
  IS_CLOUD_BILLING_ENABLED,
  OPAPINGOU_WEBHOOK_SECRET,
} from '../../constants/cloud-billing';
import { jobsClient } from '../../jobs/client';
import { computeNextPeriod } from '../../universal/cloud-billing/subscription-state';
import { getOpapingouCharge, type TProviderChargeState } from './providers/opapingou/opapingou-client';
import {
  isOpapingouPaymentReversalEvent,
  OPAPINGOU_CHARGE_PAID_EVENT,
  parseOpapingouWebhookNotification,
  verifyOpapingouWebhookSignature,
} from './providers/opapingou/opapingou-webhook';

export const CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

/**
 * How far back a charge is read again from the provider. A charge can only be paid
 * for one day (see `opapingou-client.ts`), so older ones can no longer change.
 */
export const CLOUD_BILLING_CONFIRMATION_WINDOW_DAYS = 2;

/**
 * Bounds the provider requests a single notification can cause.
 */
export const CLOUD_BILLING_MAX_CHARGES_PER_CONFIRMATION = 25;

const PRISMA_UNIQUE_VIOLATION_CODE = 'P2002';

/**
 * What happened to one of our charges when it was read back from the provider.
 */
export type TChargeConfirmationOutcome =
  | 'PROCESSED'
  | 'NOT_PAID'
  | 'ALREADY_PAID'
  | 'REJECTED_AMOUNT_MISMATCH'
  | 'UNKNOWN_TO_PROVIDER';

/**
 * What happened to an authentic, well formed notification. `ALERTED` is a refund or
 * chargeback of a payment of one of our charges: the team is told by email.
 * `IGNORED` is any other event, including the endpoint test (`ping`) and refunds
 * of payments that are not ours.
 */
export type TWebhookEventOutcome =
  | 'PROCESSED'
  | 'NOTHING_TO_CONFIRM'
  | 'REJECTED_AMOUNT_MISMATCH'
  | 'ALERTED'
  | 'IGNORED';

/**
 * Why a request was refused before being treated as a notification.
 */
export type TWebhookRefusal = 'DISABLED' | 'BODY_TOO_LARGE' | 'INVALID_SIGNATURE' | 'INVALID_BODY';

export type TWebhookResult = {
  status: 200 | 400 | 401 | 404 | 413;
  outcome: TWebhookEventOutcome | TWebhookRefusal;
  eventId?: string;
  chargeId?: string;
};

export type HandleOpapingouWebhookOptions = {
  /**
   * The request body exactly as received. The signature covers these bytes.
   */
  rawBody: string;

  /**
   * The `Opa-Signature` header.
   */
  signature: string | null | undefined;
  now?: Date;
};

/**
 * Handle a webhook from Opa Pingou.
 *
 * Nothing is read from or written to the database before the signature is verified.
 *
 * `payment.refunded` and `payment.charged_back` of a payment of one of our charges
 * are recorded and alert the team by email, once per event. They do not touch the
 * subscription yet: cancelling it automatically is planned (see the billing spec).
 *
 * Only `charge.paid` changes the subscription: the charge it names is read back from the API,
 * and only if it is one of our unpaid charges, the API reports it paid and the amount
 * matches does it activate the subscription. The provider account can also hold
 * charges of other systems; those are not ours and change nothing. Every other event
 * (including `ping`, the endpoint test) is acknowledged and ignored. A delivery that
 * changes nothing is harmless, and the same event can be handled any number of times.
 *
 * Authentic notifications answer 2xx even when nothing was confirmed. If the
 * provider cannot be read, the error propagates and the route answers 5xx, so the
 * provider delivers again.
 */
export const handleOpapingouWebhook = async ({
  rawBody,
  signature,
  now = new Date(),
}: HandleOpapingouWebhookOptions): Promise<TWebhookResult> => {
  if (!IS_CLOUD_BILLING_ENABLED()) {
    return { status: 404, outcome: 'DISABLED' };
  }

  if (Buffer.byteLength(rawBody, 'utf8') > CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES) {
    return { status: 413, outcome: 'BODY_TOO_LARGE' };
  }

  const isAuthentic = verifyOpapingouWebhookSignature({
    rawBody,
    signature,
    secret: OPAPINGOU_WEBHOOK_SECRET(),
    now,
  });

  if (!isAuthentic) {
    return { status: 401, outcome: 'INVALID_SIGNATURE' };
  }

  const notification = parseOpapingouWebhookNotification(rawBody);

  if (!notification) {
    return { status: 400, outcome: 'INVALID_BODY' };
  }

  const isChargePaid = notification.eventType === OPAPINGOU_CHARGE_PAID_EVENT;

  // A `charge.paid` that does not name its charge does not follow the contract.
  if (isChargePaid && !notification.providerChargeId) {
    return { status: 400, outcome: 'INVALID_BODY' };
  }

  const confirmations =
    isChargePaid && notification.providerChargeId
      ? await confirmCloudSubscriptionCharges({ now, providerChargeId: notification.providerChargeId })
      : [];

  const processed = confirmations.find((confirmation) => confirmation.outcome === 'PROCESSED');
  const rejected = confirmations.find((confirmation) => confirmation.outcome === 'REJECTED_AMOUNT_MISMATCH');

  const reversedCharge =
    isOpapingouPaymentReversalEvent(notification.eventType) && notification.paymentChargeId
      ? await prisma.cloudSubscriptionCharge.findUnique({
          where: {
            provider_providerChargeId: {
              provider: CLOUD_BILLING_PROVIDER,
              providerChargeId: notification.paymentChargeId,
            },
          },
          select: {
            id: true,
          },
        })
      : null;

  const outcome: TWebhookEventOutcome = reversedCharge
    ? 'ALERTED'
    : !isChargePaid
      ? 'IGNORED'
      : processed
        ? 'PROCESSED'
        : rejected
          ? 'REJECTED_AMOUNT_MISMATCH'
          : 'NOTHING_TO_CONFIRM';

  const chargeId = (processed ?? rejected)?.chargeId ?? reversedCharge?.id;

  if (reversedCharge) {
    await alertPaymentReversalOnce({
      eventId: notification.eventId,
      eventType: notification.eventType,
      chargeId: reversedCharge.id,
      providerPaymentId: notification.providerPaymentId,
      paymentAmountCents: notification.paymentAmountCents,
    });
  }

  await prisma.cloudBillingWebhookEvent
    .create({
      data: {
        provider: CLOUD_BILLING_PROVIDER,
        eventId: notification.eventId,
        eventType: notification.eventType,
        outcome,
        chargeId,
      },
    })
    .catch((err) => {
      // A redelivery of the same event: the first record is kept.
      if (err?.code !== PRISMA_UNIQUE_VIOLATION_CODE) {
        throw err;
      }
    });

  return {
    status: 200,
    outcome,
    eventId: notification.eventId,
    ...(chargeId ? { chargeId } : {}),
  };
};

type AlertPaymentReversalOnceOptions = {
  eventId: string;
  eventType: string;
  chargeId: string;
  providerPaymentId: string | null;
  paymentAmountCents: number | null;
};

/**
 * Queues the alert unless the event was already recorded, i.e. already alerted.
 * The alert is queued before the event is recorded: if recording fails, the
 * provider delivers again and the team may get the alert twice, never zero times.
 */
const alertPaymentReversalOnce = async (options: AlertPaymentReversalOnceOptions) => {
  const recorded = await prisma.cloudBillingWebhookEvent.findUnique({
    where: {
      provider_eventId: {
        provider: CLOUD_BILLING_PROVIDER,
        eventId: options.eventId,
      },
    },
    select: {
      id: true,
    },
  });

  if (recorded) {
    return;
  }

  await jobsClient.triggerJob({
    name: 'send.cloud-billing.payment-reversal.alert',
    payload: options,
  });
};

export type TChargeConfirmation = {
  chargeId: string;
  outcome: TChargeConfirmationOutcome;
};

export type ConfirmCloudSubscriptionChargesOptions = {
  now?: Date;

  /**
   * Only this provider charge. Without it, every recent unpaid charge is read.
   */
  providerChargeId?: string;
};

/**
 * Read the recent unpaid charges back from the provider and apply the paid ones.
 *
 * Charges replaced or expired on our side are included: if the money came in, it
 * is honoured.
 *
 * Every charge is read before any error is raised, so one failing request does not
 * hold back the payments that could be confirmed.
 */
export const confirmCloudSubscriptionCharges = async ({
  now = new Date(),
  providerChargeId,
}: ConfirmCloudSubscriptionChargesOptions = {}): Promise<TChargeConfirmation[]> => {
  const charges = await prisma.cloudSubscriptionCharge.findMany({
    where: {
      provider: CLOUD_BILLING_PROVIDER,
      providerChargeId: providerChargeId ?? {
        not: null,
      },
      status: {
        in: [CloudSubscriptionChargeStatus.PENDING, CloudSubscriptionChargeStatus.EXPIRED],
      },
      createdAt: {
        gte: DateTime.fromJSDate(now, { zone: 'utc' })
          .minus({ days: CLOUD_BILLING_CONFIRMATION_WINDOW_DAYS })
          .toJSDate(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: CLOUD_BILLING_MAX_CHARGES_PER_CONFIRMATION,
  });

  const states = await Promise.allSettled(
    charges.map(async (charge) => await getOpapingouCharge({ providerChargeId: charge.providerChargeId ?? '' })),
  );

  const confirmations: TChargeConfirmation[] = [];

  // Oldest first, so the periods of an organisation are granted in payment order.
  for (const [index, charge] of [...charges.entries()].reverse()) {
    const state = states[index];

    if (state.status === 'fulfilled') {
      confirmations.push({ chargeId: charge.id, outcome: await applyChargeState({ charge, state: state.value, now }) });
    }
  }

  const failure = states.find((state) => state.status === 'rejected');

  if (failure) {
    throw failure.reason;
  }

  return confirmations;
};

type ApplyChargeStateOptions = {
  charge: CloudSubscriptionCharge;
  state: TProviderChargeState | null;
  now: Date;
};

const applyChargeState = async ({
  charge,
  state,
  now,
}: ApplyChargeStateOptions): Promise<TChargeConfirmationOutcome> => {
  if (!state) {
    return 'UNKNOWN_TO_PROVIDER';
  }

  if (!state.isPaid) {
    return 'NOT_PAID';
  }

  if (state.amountCents !== charge.amountCents) {
    return 'REJECTED_AMOUNT_MISMATCH';
  }

  return await prisma.$transaction(async (tx): Promise<TChargeConfirmationOutcome> => {
    // Payments of the same organisation are handled one at a time, so each one
    // extends the period the previous one left.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cloud-billing-subscription:${charge.organisationId}`}))`;

    // Idempotency: only one confirmation can take the charge out of an unpaid
    // status, however many notifications arrive at the same time. An expired charge is still honoured, since the money came in.
    const { count } = await tx.cloudSubscriptionCharge.updateMany({
      where: {
        id: charge.id,
        status: {
          in: [CloudSubscriptionChargeStatus.PENDING, CloudSubscriptionChargeStatus.EXPIRED],
        },
      },
      data: {
        status: CloudSubscriptionChargeStatus.PAID,
        paidAt: now,
      },
    });

    if (count === 0) {
      return 'ALREADY_PAID';
    }

    const subscription = await tx.cloudSubscription.findUnique({
      where: {
        organisationId: charge.organisationId,
      },
    });

    const { periodStart, periodEnd } = computeNextPeriod({
      now,
      currentPeriodEnd: subscription?.currentPeriodEnd,
    });

    await tx.cloudSubscription.upsert({
      where: {
        organisationId: charge.organisationId,
      },
      create: {
        organisationId: charge.organisationId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      update: {
        // The start only moves when the subscription had lapsed.
        currentPeriodStart: subscription && subscription.currentPeriodEnd > now ? undefined : periodStart,
        currentPeriodEnd: periodEnd,
      },
    });

    await tx.cloudSubscriptionCharge.update({
      where: {
        id: charge.id,
      },
      data: {
        periodStart,
        periodEnd,
      },
    });

    return 'PROCESSED';
  });
};
