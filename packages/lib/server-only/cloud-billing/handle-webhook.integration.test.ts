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
import { handleOpapingouWebhook } from './handle-webhook';
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

const CHECKOUT_AT = new Date('2026-10-15T12:00:00.000Z');
const PAID_AT = new Date('2026-10-15T12:05:00.000Z');

describe.skipIf(!hasTestDatabase)('handleOpapingouWebhook', () => {
  let api: TSimulatedOpapingouApi;
  let organisationId: string;
  let userId: number;

  const startCheckout = async (now = CHECKOUT_AT) => {
    const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now });

    return await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: checkout.id } });
  };

  type SendPaymentOptions = {
    eventId?: string | null;
    chargeId?: string | null;
    reference?: string | null;
    amount?: string | number;
    eventName?: string;
    now?: Date;
  };

  // Event ids are scoped by organisation, since test files share the database.
  const scopedEventId = (eventId: string) => `${organisationId}:${eventId}`;

  const countSubscriptions = async () => await prisma.cloudSubscription.count({ where: { organisationId } });

  const findEvents = async () =>
    await prisma.cloudBillingWebhookEvent.findMany({
      where: { eventId: { startsWith: `${organisationId}:` } },
    });

  const sendPayment = async ({
    eventId = 'evt_1',
    chargeId,
    reference,
    amount = '99.90',
    eventName = 'pingou',
    now = PAID_AT,
  }: SendPaymentOptions) => {
    const { rawBody, signature } = api.buildSignedWebhook({
      ...(eventId === null ? {} : { id: scopedEventId(eventId) }),
      evento: eventName,
      cobranca: {
        ...(chargeId ? { id: chargeId } : {}),
        ...(reference ? { referencia: reference } : {}),
        valor: amount,
        status: 'pingou',
      },
    });

    return await handleOpapingouWebhook({ rawBody, signature, now });
  };

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.CLOUD_BILLING_TEST_DATABASE_URL ?? '');

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

  it('activates the subscription for one month when the charge is paid', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id });

    expect(result).toEqual({ status: 200, outcome: 'PROCESSED', eventId: scopedEventId('evt_1'), chargeId: charge.id });

    const paidCharge = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: charge.id } });
    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    expect(paidCharge.status).toBe(CloudSubscriptionChargeStatus.PAID);
    expect(paidCharge.paidAt?.toISOString()).toBe('2026-10-15T12:05:00.000Z');
    expect(paidCharge.periodStart?.toISOString()).toBe('2026-10-15T12:05:00.000Z');
    expect(paidCharge.periodEnd?.toISOString()).toBe('2026-11-15T12:05:00.000Z');

    expect(subscription.currentPeriodStart.toISOString()).toBe('2026-10-15T12:05:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-11-15T12:05:00.000Z');
  });

  it('records the handled event', async () => {
    const charge = await startCheckout();

    await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id });

    const events = await findEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: 'opapingou',
      eventId: scopedEventId('evt_1'),
      eventType: 'pingou',
      outcome: 'PROCESSED',
      chargeId: charge.id,
    });
  });

  it('does nothing when the same event is delivered again', async () => {
    const charge = await startCheckout();

    await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id });

    const result = await sendPayment({
      chargeId: charge.providerChargeId,
      reference: charge.id,
      now: new Date('2026-10-20T00:00:00.000Z'),
    });

    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    expect(result).toEqual({ status: 200, outcome: 'DUPLICATE', eventId: scopedEventId('evt_1') });
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-11-15T12:05:00.000Z');
    expect(await findEvents()).toHaveLength(1);
  });

  it('grants a single month when the same event arrives twice at the same time', async () => {
    const charge = await startCheckout();

    const results = await Promise.all([
      sendPayment({ chargeId: charge.providerChargeId, reference: charge.id }),
      sendPayment({ chargeId: charge.providerChargeId, reference: charge.id }),
    ]);

    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    expect(results.map((result) => result.outcome).sort()).toEqual(['DUPLICATE', 'PROCESSED']);
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-11-15T12:05:00.000Z');
  });

  it('grants a single month when two different events report the same payment', async () => {
    const charge = await startCheckout();

    await sendPayment({ eventId: 'evt_1', chargeId: charge.providerChargeId, reference: charge.id });

    const result = await sendPayment({
      eventId: 'evt_2',
      chargeId: charge.providerChargeId,
      reference: charge.id,
      now: new Date('2026-10-20T00:00:00.000Z'),
    });

    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    expect(result).toEqual({
      status: 200,
      outcome: 'ALREADY_PAID',
      eventId: scopedEventId('evt_2'),
      chargeId: charge.id,
    });
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-11-15T12:05:00.000Z');
  });

  it('uses the hash of the body to deduplicate events without an id', async () => {
    const charge = await startCheckout();

    const first = await sendPayment({ eventId: null, chargeId: charge.providerChargeId, reference: charge.id });
    const second = await sendPayment({ eventId: null, chargeId: charge.providerChargeId, reference: charge.id });

    expect(first.outcome).toBe('PROCESSED');
    expect(second.outcome).toBe('DUPLICATE');
    expect(first.eventId).toMatch(/^sha256:/);
  });

  it('does not activate anything when the paid amount differs', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id, amount: '50.00' });

    const unpaidCharge = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: charge.id } });

    expect(result).toEqual({
      status: 200,
      outcome: 'REJECTED_AMOUNT_MISMATCH',
      eventId: scopedEventId('evt_1'),
      chargeId: charge.id,
    });
    expect(unpaidCharge.status).toBe(CloudSubscriptionChargeStatus.PENDING);
    expect(await countSubscriptions()).toBe(0);
  });

  it('does not activate anything when the amount cannot be read', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id, amount: 'abc' });

    expect(result.outcome).toBe('REJECTED_AMOUNT_MISMATCH');
    expect(await countSubscriptions()).toBe(0);
  });

  it('ignores a payment for a charge it does not know', async () => {
    await startCheckout();

    const result = await sendPayment({ chargeId: 'cob_unknown', reference: 'unknown_reference' });

    expect(result).toEqual({ status: 200, outcome: 'IGNORED_UNKNOWN_CHARGE', eventId: scopedEventId('evt_1') });
    expect(await countSubscriptions()).toBe(0);
  });

  it('ignores a payment whose provider id does not match the referenced charge', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({ chargeId: 'cob_of_someone_else', reference: charge.id });

    expect(result.outcome).toBe('IGNORED_UNKNOWN_CHARGE');
    expect(await countSubscriptions()).toBe(0);
  });

  it('ignores events that are not a payment', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({
      chargeId: charge.providerChargeId,
      reference: charge.id,
      eventName: 'cobranca_criada',
    });

    expect(result).toEqual({ status: 200, outcome: 'IGNORED_EVENT_TYPE', eventId: scopedEventId('evt_1') });
    expect(await countSubscriptions()).toBe(0);
  });

  it('finds the charge by the provider id when there is no reference', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({ chargeId: charge.providerChargeId });

    expect(result.outcome).toBe('PROCESSED');
    expect(result.chargeId).toBe(charge.id);
  });

  it('finds the charge by the reference when there is no provider id', async () => {
    const charge = await startCheckout();

    const result = await sendPayment({ reference: charge.id });

    expect(result.outcome).toBe('PROCESSED');
  });

  it('honours the payment of a charge that had expired', async () => {
    const charge = await startCheckout();

    await prisma.cloudSubscriptionCharge.update({
      where: { id: charge.id },
      data: { status: CloudSubscriptionChargeStatus.EXPIRED },
    });

    const result = await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id });

    expect(result.outcome).toBe('PROCESSED');
    expect(await countSubscriptions()).toBe(1);
  });

  it('extends from the end of the running period on renewal', async () => {
    const firstCharge = await startCheckout();

    await sendPayment({ eventId: 'evt_1', chargeId: firstCharge.providerChargeId, reference: firstCharge.id });

    const renewalAt = new Date('2026-11-10T09:00:00.000Z');
    const renewalCharge = await startCheckout(renewalAt);

    const result = await sendPayment({
      eventId: 'evt_2',
      chargeId: renewalCharge.providerChargeId,
      reference: renewalCharge.id,
      now: renewalAt,
    });

    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    const paidRenewal = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: renewalCharge.id } });

    expect(renewalCharge.id).not.toBe(firstCharge.id);
    expect(result.outcome).toBe('PROCESSED');

    // The charge records the month it bought.
    expect(paidRenewal.periodStart?.toISOString()).toBe('2026-11-15T12:05:00.000Z');
    expect(paidRenewal.periodEnd?.toISOString()).toBe('2026-12-15T12:05:00.000Z');

    // The subscription records the uninterrupted coverage.
    expect(subscription.currentPeriodStart.toISOString()).toBe('2026-10-15T12:05:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-12-15T12:05:00.000Z');
  });

  it('restarts from the payment date when renewing after the period ended', async () => {
    const firstCharge = await startCheckout();

    await sendPayment({ eventId: 'evt_1', chargeId: firstCharge.providerChargeId, reference: firstCharge.id });

    const renewalAt = new Date('2026-12-01T09:00:00.000Z');
    const renewalCharge = await startCheckout(renewalAt);

    await sendPayment({
      eventId: 'evt_2',
      chargeId: renewalCharge.providerChargeId,
      reference: renewalCharge.id,
      now: renewalAt,
    });

    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    expect(subscription.currentPeriodStart.toISOString()).toBe('2026-12-01T09:00:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-01-01T09:00:00.000Z');
  });

  it('grants two months when two charges of the organisation are paid at the same time', async () => {
    const firstCharge = await startCheckout();

    const secondCharge = await prisma.cloudSubscriptionCharge.create({
      data: {
        organisationId,
        provider: 'opapingou',
        providerChargeId: 'cob_second',
        amountCents: 9990,
      },
    });

    const results = await Promise.all([
      sendPayment({ eventId: 'evt_1', chargeId: firstCharge.providerChargeId, reference: firstCharge.id }),
      sendPayment({ eventId: 'evt_2', chargeId: secondCharge.providerChargeId, reference: secondCharge.id }),
    ]);

    const subscription = await prisma.cloudSubscription.findUniqueOrThrow({ where: { organisationId } });

    expect(results.map((result) => result.outcome)).toEqual(['PROCESSED', 'PROCESSED']);
    expect(subscription.currentPeriodStart.toISOString()).toBe('2026-10-15T12:05:00.000Z');
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2026-12-15T12:05:00.000Z');
  });

  it('does not touch the subscription of another organisation', async () => {
    const other = await createTestOrganisation();
    const charge = await startCheckout();

    await sendPayment({ chargeId: charge.providerChargeId, reference: charge.id });

    expect(await prisma.cloudSubscription.count({ where: { organisationId: other.organisation.id } })).toBe(0);
  });
});
