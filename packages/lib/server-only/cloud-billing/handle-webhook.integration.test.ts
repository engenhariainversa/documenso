import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { hasTestDatabase } = vi.hoisted(() => {
  const databaseUrl = process.env.CLOUD_BILLING_TEST_DATABASE_URL;

  if (databaseUrl) {
    process.env.NEXT_PRIVATE_DATABASE_URL = databaseUrl;
    process.env.NEXT_PRIVATE_DIRECT_DATABASE_URL = databaseUrl;
  }

  return { hasTestDatabase: Boolean(databaseUrl) };
});

import { prisma } from '@documenso/prisma';
import { CloudSubscriptionChargeStatus } from '@prisma/client';

import { createCloudSubscriptionCheckout } from './create-checkout';
import { CLOUD_BILLING_CONFIRMATION_WINDOW_DAYS, handleOpapingouWebhook } from './handle-webhook';
import {
  SIMULATED_OPAPINGOU_API_KEY,
  SIMULATED_OPAPINGOU_WEBHOOK_SECRET,
  startSimulatedOpapingouApi,
  type TSimulatedOpapingouApi,
} from './providers/opapingou/simulated-opapingou-api';
import {
  assertDisposableDatabaseUrl,
  createTestOrganisation,
  resetCloudBillingForOrganisations,
} from './test-database';

// Later than the dates of the other integration files, which share the database.
const FIRST_DATE_OF_THIS_FILE = new Date('2027-01-01T00:00:00.000Z');
const CHECKOUT_AT = new Date('2027-03-15T12:00:00.000Z');
const PAID_AT = new Date('2027-03-15T12:05:00.000Z');

describe.skipIf(!hasTestDatabase)('handleOpapingouWebhook', () => {
  let api: TSimulatedOpapingouApi;
  let organisationId: string;
  let userId: number;

  const startCheckout = async (now = CHECKOUT_AT, isReplacement = false) => {
    const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now, isReplacement });

    return await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: checkout.id } });
  };

  const payAtProvider = (charge: { providerChargeId: string | null }, amountCents?: number) => {
    api.updateCharge(charge.providerChargeId ?? '', { status: 'PAID', amountCents });
  };

  type NotifyOptions = {
    delivery?: string;
    type?: string;
    resourceType?: string;
    object?: Record<string, unknown>;
    now?: Date;
  };

  const eventIdOf = (delivery: string) => `evt:${organisationId}:${delivery}`;

  /**
   * An authentic delivery in the documented format, signed at `now`. The organisation
   * id in the event id keeps it apart from other test files.
   */
  const notify = async (
    charge: { providerChargeId: string | null } | null,
    {
      delivery = 'delivery_1',
      type = 'charge.paid',
      resourceType = 'charge',
      object = { id: charge?.providerChargeId, status: 'PAID', amountCents: 9990 },
      now = PAID_AT,
    }: NotifyOptions = {},
  ) => {
    const { rawBody, signature, eventId, eventType } = api.buildSignedWebhook(
      {
        id: eventIdOf(delivery),
        type,
        occurredAt: now.toISOString(),
        testMode: true,
        data: { type: resourceType, object },
      },
      { timestamp: Math.floor(now.getTime() / 1000) },
    );

    return await handleOpapingouWebhook({
      rawBody,
      signature,
      eventIdHeader: eventId,
      eventTypeHeader: eventType,
      now,
    });
  };

  const findCharge = async (id: string) => await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id } });

  const findSubscription = async () => await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

  const countSubscriptions = async () => await prisma.cloudSubscription.count({ where: { organisationId } });

  const chargeReads = () => api.requests.filter((request) => request.method === 'GET');

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.CLOUD_BILLING_TEST_DATABASE_URL ?? '');

    // Charges left by earlier runs of this file, the only one that uses these dates.
    await prisma.cloudSubscriptionCharge.deleteMany({ where: { createdAt: { gte: FIRST_DATE_OF_THIS_FILE } } });

    const { organisation, user } = await createTestOrganisation();

    organisationId = organisation.id;
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetCloudBillingForOrganisations([organisationId]);

    api = await startSimulatedOpapingouApi();

    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', api.url);
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', SIMULATED_OPAPINGOU_API_KEY);
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', SIMULATED_OPAPINGOU_WEBHOOK_SECRET);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();

    await api.close();
  });

  it('activates the subscription for one month when the provider reports the charge paid', async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    const result = await notify(charge);

    expect(result).toEqual({
      status: 200,
      outcome: 'PROCESSED',
      eventId: eventIdOf('delivery_1'),
      chargeId: charge.id,
    });

    const paidCharge = await findCharge(charge.id);
    const subscription = await findSubscription();

    expect(chargeReads().map((request) => request.path)).toContain(`/v1/charges/${charge.providerChargeId}`);

    expect(paidCharge.status).toBe(CloudSubscriptionChargeStatus.PAID);
    expect(paidCharge.paidAt?.toISOString()).toBe('2027-03-15T12:05:00.000Z');
    expect(paidCharge.periodStart?.toISOString()).toBe('2027-03-15T12:05:00.000Z');
    expect(paidCharge.periodEnd?.toISOString()).toBe('2027-04-15T12:05:00.000Z');

    expect(subscription.currentPeriodStart.toISOString()).toBe('2027-03-15T12:05:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-04-15T12:05:00.000Z');
  });

  it('records the notification', async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    const result = await notify(charge);

    const events = await prisma.cloudBillingWebhookEvent.findMany({ where: { eventId: result.eventId } });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: 'opapingou',
      eventType: 'charge.paid',
      outcome: 'PROCESSED',
      chargeId: charge.id,
    });
  });

  it('does not trust a body that claims a payment the provider does not report', async () => {
    const charge = await startCheckout();

    // The signed body says PAID, but the API still reports the charge PENDING.
    const result = await notify(charge);

    expect(result.outcome).toBe('NOTHING_TO_CONFIRM');
    expect((await findCharge(charge.id)).status).toBe(CloudSubscriptionChargeStatus.PENDING);
    expect(await countSubscriptions()).toBe(0);
  });

  it.each([
    'EXPIRED',
    'CANCELED',
  ] as const)('does not activate anything for a charge %s at the provider', async (status) => {
    const charge = await startCheckout();

    api.updateCharge(charge.providerChargeId ?? '', { status });

    const result = await notify(charge);

    expect(result.outcome).toBe('NOTHING_TO_CONFIRM');
    expect(await countSubscriptions()).toBe(0);
  });

  it('does nothing when the same notification is delivered again, without asking the provider', async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    const first = await notify(charge);
    const readsAfterFirst = chargeReads().length;
    const second = await notify(charge, { now: new Date('2027-03-16T00:00:00.000Z') });

    const subscription = await findSubscription();

    expect(second).toEqual({ status: 200, outcome: 'ALREADY_PROCESSED', eventId: first.eventId, chargeId: charge.id });
    expect(chargeReads()).toHaveLength(readsAfterFirst);
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-04-15T12:05:00.000Z');
    expect(await prisma.cloudBillingWebhookEvent.count({ where: { eventId: first.eventId } })).toBe(1);
  });

  it('grants a single month when two notifications arrive at the same time', async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    const results = await Promise.all([notify(charge, { delivery: 'a' }), notify(charge, { delivery: 'b' })]);

    const subscription = await findSubscription();

    expect(results.map((result) => result.outcome).sort()).toEqual(['NOTHING_TO_CONFIRM', 'PROCESSED']);
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-04-15T12:05:00.000Z');
  });

  it('does not activate anything when the provider reports another amount', async () => {
    const charge = await startCheckout();

    payAtProvider(charge, 5000);

    const result = await notify(charge);

    expect(result).toEqual({
      status: 200,
      outcome: 'REJECTED_AMOUNT_MISMATCH',
      eventId: eventIdOf('delivery_1'),
      chargeId: charge.id,
    });
    expect((await findCharge(charge.id)).status).toBe(CloudSubscriptionChargeStatus.PENDING);
    expect(await countSubscriptions()).toBe(0);
  });

  it('honours the payment of a charge that expired on our side', async () => {
    const charge = await startCheckout();

    await prisma.cloudSubscriptionCharge.update({
      where: { id: charge.id },
      data: { status: CloudSubscriptionChargeStatus.EXPIRED },
    });

    payAtProvider(charge);

    const result = await notify(charge);

    expect(result.outcome).toBe('PROCESSED');
    expect(await countSubscriptions()).toBe(1);
  });

  it(`does not read charges older than ${CLOUD_BILLING_CONFIRMATION_WINDOW_DAYS} days`, async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    const result = await notify(charge, { now: new Date('2027-03-17T12:01:00.000Z') });

    expect(result.outcome).toBe('NOTHING_TO_CONFIRM');
    expect(chargeReads().map((request) => request.path)).not.toContain(`/v1/charges/${charge.providerChargeId}`);
    expect(await countSubscriptions()).toBe(0);
  });

  it('answers with an error while the provider cannot be read, and confirms on the next delivery', async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    api.setNextResponse({ status: 503, body: '' });

    await expect(notify(charge)).rejects.toThrow();

    expect(await countSubscriptions()).toBe(0);

    const retried = await notify(charge);

    expect(retried.outcome).toBe('PROCESSED');
    expect(await countSubscriptions()).toBe(1);
  });

  it('ignores charge.paid for a charge that is not ours, without asking the provider', async () => {
    const charge = await startCheckout();

    payAtProvider(charge);

    // The provider account also receives the charges of other systems.
    const result = await notify({ providerChargeId: 'charge-of-another-system' });

    expect(result).toEqual({ status: 200, outcome: 'NOTHING_TO_CONFIRM', eventId: eventIdOf('delivery_1') });
    expect(chargeReads()).toEqual([]);
    expect((await findCharge(charge.id)).status).toBe(CloudSubscriptionChargeStatus.PENDING);
    expect(await countSubscriptions()).toBe(0);
  });

  it('reads only the charge named by the event', async () => {
    const charge = await startCheckout();
    const other = await startCheckout(new Date('2027-03-15T12:01:00.000Z'), true);

    payAtProvider(charge);
    payAtProvider(other);

    await notify(charge);

    expect(chargeReads().map((request) => request.path)).toEqual([`/v1/charges/${charge.providerChargeId}`]);
    expect((await findCharge(other.id)).status).toBe(CloudSubscriptionChargeStatus.PENDING);
  });

  it('does nothing for one of our charges the provider does not know', async () => {
    const unknown = await prisma.cloudSubscriptionCharge.create({
      data: {
        createdAt: CHECKOUT_AT,
        organisationId,
        provider: 'opapingou',
        providerChargeId: `unknown-to-the-provider-${organisationId}`,
        amountCents: 9990,
        status: CloudSubscriptionChargeStatus.EXPIRED,
      },
    });

    const result = await notify(unknown);

    expect(result.outcome).toBe('NOTHING_TO_CONFIRM');
    expect(chargeReads().map((request) => request.path)).toEqual([`/v1/charges/${unknown.providerChargeId}`]);
  });

  it.each([
    ['ping', 'ping', {}],
    ['payment.confirmed', 'payment', { id: 'payment-1', status: 'CONFIRMED' }],
    ['charge.expired', 'charge', { id: 'whatever', status: 'EXPIRED' }],
  ])('acknowledges and ignores %s', async (type, resourceType, object) => {
    const charge = await startCheckout();

    payAtProvider(charge);

    const result = await notify(charge, { type, resourceType, object, delivery: `ignored-${type}` });

    expect(result).toEqual({ status: 200, outcome: 'IGNORED', eventId: eventIdOf(`ignored-${type}`) });
    expect(chargeReads()).toEqual([]);
    expect(await countSubscriptions()).toBe(0);
    expect(await prisma.cloudBillingWebhookEvent.findFirst({ where: { eventId: result.eventId } })).toMatchObject({
      eventType: type,
      outcome: 'IGNORED',
    });
  });

  it('extends from the end of the running period on renewal', async () => {
    const firstCharge = await startCheckout();

    payAtProvider(firstCharge);

    await notify(firstCharge, { delivery: 'first' });

    const renewalAt = new Date('2027-04-10T09:00:00.000Z');
    const renewalCharge = await startCheckout(renewalAt);

    payAtProvider(renewalCharge);

    const result = await notify(renewalCharge, { delivery: 'renewal', now: renewalAt });

    const subscription = await findSubscription();
    const paidRenewal = await findCharge(renewalCharge.id);

    expect(renewalCharge.id).not.toBe(firstCharge.id);
    expect(result.outcome).toBe('PROCESSED');

    // The charge records the month it bought.
    expect(paidRenewal.periodStart?.toISOString()).toBe('2027-04-15T12:05:00.000Z');
    expect(paidRenewal.periodEnd?.toISOString()).toBe('2027-05-15T12:05:00.000Z');

    // The subscription records the uninterrupted coverage.
    expect(subscription.currentPeriodStart.toISOString()).toBe('2027-03-15T12:05:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-05-15T12:05:00.000Z');
  });

  it('restarts from the payment date when renewing after the period ended', async () => {
    const firstCharge = await startCheckout();

    payAtProvider(firstCharge);

    await notify(firstCharge, { delivery: 'first' });

    const renewalAt = new Date('2027-05-01T09:00:00.000Z');
    const renewalCharge = await startCheckout(renewalAt);

    payAtProvider(renewalCharge);

    await notify(renewalCharge, { delivery: 'renewal', now: renewalAt });

    const subscription = await findSubscription();

    expect(subscription.currentPeriodStart.toISOString()).toBe('2027-05-01T09:00:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-06-01T09:00:00.000Z');
  });

  it('grants two months when a replaced charge and its replacement are both paid', async () => {
    const firstCharge = await startCheckout();
    const secondCharge = await startCheckout(new Date('2027-03-15T12:01:00.000Z'), true);

    payAtProvider(firstCharge);
    payAtProvider(secondCharge);

    // One charge.paid per charge, the oldest first.
    await notify(firstCharge, { delivery: 'first' });

    const result = await notify(secondCharge, { delivery: 'second' });

    const subscription = await findSubscription();

    expect(secondCharge.id).not.toBe(firstCharge.id);
    expect(result.outcome).toBe('PROCESSED');
    expect((await findCharge(firstCharge.id)).status).toBe(CloudSubscriptionChargeStatus.PAID);
    expect((await findCharge(secondCharge.id)).status).toBe(CloudSubscriptionChargeStatus.PAID);
    expect(subscription.currentPeriodStart.toISOString()).toBe('2027-03-15T12:05:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-05-15T12:05:00.000Z');

    // The oldest charge bought the first month.
    expect((await findCharge(firstCharge.id)).periodEnd?.toISOString()).toBe('2027-04-15T12:05:00.000Z');
  });

  it('does not touch the subscription of another organisation', async () => {
    const other = await createTestOrganisation();
    const charge = await startCheckout();

    payAtProvider(charge);

    await notify(charge);

    expect(await prisma.cloudSubscription.count({ where: { organisationId: other.organisation.id } })).toBe(0);
  });
});
