import { prisma } from '@documenso/prisma';
import type { Prisma } from '@prisma/client';
import { CloudSubscriptionChargeStatus } from '@prisma/client';

import {
  CLOUD_BILLING_PROVIDER,
  IS_CLOUD_BILLING_ENABLED,
  OPAPINGOU_WEBHOOK_SECRET,
} from '../../constants/cloud-billing';
import { AppError } from '../../errors/app-error';
import { computeNextPeriod } from '../../universal/cloud-billing/subscription-state';
import {
  parseOpapingouWebhookEvent,
  type TProviderWebhookEvent,
  verifyOpapingouWebhookSignature,
} from './providers/opapingou/opapingou-webhook';

export const CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

const DUPLICATE_EVENT_ERROR_CODE = 'CLOUD_BILLING_DUPLICATE_EVENT';

const PRISMA_UNIQUE_VIOLATION_CODE = 'P2002';

/**
 * What happened to an authentic, well formed event.
 */
export type TWebhookEventOutcome =
  | 'PROCESSED'
  | 'DUPLICATE'
  | 'ALREADY_PAID'
  | 'IGNORED_EVENT_TYPE'
  | 'IGNORED_UNKNOWN_CHARGE'
  | 'REJECTED_AMOUNT_MISMATCH';

/**
 * Why a request was refused before being treated as an event.
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
  signature: string | null | undefined;
  now?: Date;
};

/**
 * Handle a payment webhook from Opa Pingou.
 *
 * Nothing is read from or written to the database before the signature is verified.
 *
 * Authentic events answer 2xx even when they are ignored, so the provider does not
 * keep retrying something that will never be accepted.
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
  });

  if (!isAuthentic) {
    return { status: 401, outcome: 'INVALID_SIGNATURE' };
  }

  const event = parseOpapingouWebhookEvent(rawBody);

  if (!event) {
    return { status: 400, outcome: 'INVALID_BODY' };
  }

  const result = await prisma
    .$transaction(async (tx) => await processEvent({ tx, event, now }))
    .catch((err) => {
      if (AppError.parseError(err).code === DUPLICATE_EVENT_ERROR_CODE) {
        return { outcome: 'DUPLICATE' as const, chargeId: undefined };
      }

      throw err;
    });

  return {
    status: 200,
    outcome: result.outcome,
    eventId: event.eventId,
    ...(result.chargeId ? { chargeId: result.chargeId } : {}),
  };
};

type ProcessEventOptions = {
  tx: Prisma.TransactionClient;
  event: TProviderWebhookEvent;
  now: Date;
};

type TProcessEventResult = {
  outcome: TWebhookEventOutcome;
  chargeId?: string;
};

/**
 * Runs in a single transaction: if anything fails, the record of the event is
 * rolled back too, and the provider's next delivery is handled from scratch.
 */
const processEvent = async ({ tx, event, now }: ProcessEventOptions): Promise<TProcessEventResult> => {
  // First layer of idempotency: the unique key refuses an event already handled,
  // and makes a concurrent delivery of the same event wait and then fail.
  const recordedEvent = await tx.cloudBillingWebhookEvent
    .create({
      data: {
        provider: CLOUD_BILLING_PROVIDER,
        eventId: event.eventId,
        eventType: event.eventType,
        outcome: 'PROCESSING',
      },
    })
    .catch((err) => {
      if (err?.code === PRISMA_UNIQUE_VIOLATION_CODE) {
        throw new AppError(DUPLICATE_EVENT_ERROR_CODE);
      }

      throw err;
    });

  const result = await applyEvent({ tx, event, now });

  await tx.cloudBillingWebhookEvent.update({
    where: {
      id: recordedEvent.id,
    },
    data: {
      outcome: result.outcome,
      chargeId: result.chargeId,
    },
  });

  return result;
};

const applyEvent = async ({ tx, event, now }: ProcessEventOptions): Promise<TProcessEventResult> => {
  if (!event.isPayment) {
    return { outcome: 'IGNORED_EVENT_TYPE' };
  }

  const charge = await findCharge({ tx, event });

  if (!charge) {
    return { outcome: 'IGNORED_UNKNOWN_CHARGE' };
  }

  if (event.amountCents === null || event.amountCents !== charge.amountCents) {
    return { outcome: 'REJECTED_AMOUNT_MISMATCH', chargeId: charge.id };
  }

  // Payments of the same organisation are handled one at a time, so each one
  // extends the period the previous one left.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cloud-billing-subscription:${charge.organisationId}`}))`;

  // Second layer of idempotency: only one event can take the charge out of an
  // unpaid status. An expired charge is still honoured, since the money came in.
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
    return { outcome: 'ALREADY_PAID', chargeId: charge.id };
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

  return { outcome: 'PROCESSED', chargeId: charge.id };
};

type FindChargeOptions = {
  tx: Prisma.TransactionClient;
  event: TProviderWebhookEvent;
};

/**
 * The reference is our own charge id, so it is looked up first. The provider's id
 * is the fallback, and must agree with the charge when both are known.
 */
const findCharge = async ({ tx, event }: FindChargeOptions) => {
  const { reference, providerChargeId } = event;

  if (!reference && !providerChargeId) {
    return null;
  }

  const charge = reference
    ? await tx.cloudSubscriptionCharge.findFirst({
        where: {
          id: reference,
          provider: CLOUD_BILLING_PROVIDER,
        },
      })
    : await tx.cloudSubscriptionCharge.findFirst({
        where: {
          provider: CLOUD_BILLING_PROVIDER,
          providerChargeId,
        },
      });

  if (!charge) {
    return null;
  }

  const isProviderIdMismatch =
    providerChargeId !== null && charge.providerChargeId !== null && charge.providerChargeId !== providerChargeId;

  if (isProviderIdMismatch) {
    return null;
  }

  return charge;
};
