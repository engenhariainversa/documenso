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

import { AppError, AppErrorCode } from '../../errors/app-error';
import { createCloudSubscriptionCheckout } from './create-checkout';
import { getCloudSubscription } from './get-cloud-subscription';
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

const NOW = new Date('2026-10-15T12:00:00.000Z');

const catchError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return AppError.parseError(err);
  }

  throw new Error('Expected the promise to reject');
};

describe.skipIf(!hasTestDatabase)('createCloudSubscriptionCheckout', () => {
  let api: TSimulatedOpapingouApi;
  let organisationId: string;
  let userId: number;

  const countCharges = async () => await prisma.cloudSubscriptionCharge.count({ where: { organisationId } });

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

  it('creates a pending charge for R$ 99,90 at the provider', async () => {
    const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    const charge = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: checkout.id } });

    expect(charge.status).toBe(CloudSubscriptionChargeStatus.PENDING);
    expect(charge.amountCents).toBe(9990);
    expect(charge.currency).toBe('BRL');
    expect(charge.provider).toBe('opapingou');
    expect(charge.organisationId).toBe(organisationId);
    expect(charge.createdByUserId).toBe(userId);
    expect(charge.providerChargeId).toMatch(/^cob_/);

    expect(checkout.amountCents).toBe(9990);
    expect(checkout.paymentUrl).toBe(`https://pagamento.invalid/${charge.providerChargeId}`);
    expect(checkout.pixCopyPaste).toBe(`00020126SIMULADO${charge.providerChargeId}`);
  });

  it('sends the charge id as the reference', async () => {
    const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    const params = new URLSearchParams(api.requests[0].body);

    expect(params.get('referencia')).toBe(checkout.id);
    expect(params.get('valor')).toBe('99.90');
  });

  it('does not create a subscription before payment', async () => {
    await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    expect(await prisma.cloudSubscription.count({ where: { organisationId } })).toBe(0);
  });

  it('hands back the same pending charge on a second call', async () => {
    const first = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });
    const second = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    expect(second.id).toBe(first.id);
    expect(api.requests).toHaveLength(1);
    expect(await countCharges()).toBe(1);
  });

  it('creates a single charge when two checkouts race', async () => {
    const results = await Promise.allSettled([
      createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }),
      createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(api.requests).toHaveLength(1);
    expect(await countCharges()).toBe(1);
  });

  it('replaces a pending charge that already expired', async () => {
    const first = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    await prisma.cloudSubscriptionCharge.update({
      where: { id: first.id },
      data: { expiresAt: new Date('2026-10-15T11:00:00.000Z') },
    });

    const second = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    const expired = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: first.id } });

    expect(second.id).not.toBe(first.id);
    expect(expired.status).toBe(CloudSubscriptionChargeStatus.EXPIRED);
    expect(api.requests).toHaveLength(2);
  });

  it('does not reuse a pending charge older than 24 hours', async () => {
    const first = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    await prisma.cloudSubscriptionCharge.update({
      where: { id: first.id },
      data: { expiresAt: null, createdAt: new Date('2026-10-14T11:59:00.000Z') },
    });

    const second = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    expect(second.id).not.toBe(first.id);
  });

  it('replaces the pending charge when asked for a new one', async () => {
    const first = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    const second = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW, isReplacement: true });

    const replaced = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: first.id } });

    expect(second.id).not.toBe(first.id);
    expect(replaced.status).toBe(CloudSubscriptionChargeStatus.EXPIRED);
    expect(api.requests).toHaveLength(2);
  });

  it('keeps a single pending charge after a replacement', async () => {
    await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });
    await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW, isReplacement: true });

    const pendingCount = await prisma.cloudSubscriptionCharge.count({
      where: { organisationId, status: CloudSubscriptionChargeStatus.PENDING },
    });

    expect(pendingCount).toBe(1);
  });

  it('creates a charge when asked for a replacement and there is nothing to replace', async () => {
    const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW, isReplacement: true });

    expect(checkout.paymentUrl).not.toBeNull();
    expect(api.requests).toHaveLength(1);
  });

  it('rejects the second of two racing checkouts as already in progress', async () => {
    const results = await Promise.allSettled([
      createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }),
      createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }),
    ]);

    const rejected = results.filter((result) => result.status === 'rejected');
    const fulfilled = results.filter((result) => result.status === 'fulfilled');

    // Either the second call waited and got the same charge, or it was refused.
    expect(fulfilled.length + rejected.length).toBe(2);

    for (const result of rejected) {
      expect(AppError.parseError(result.reason).code).toBe(AppErrorCode.ALREADY_EXISTS);
    }

    const ids = new Set(fulfilled.map((result) => result.value.id));

    expect(ids.size).toBe(1);
  });

  it('never reuses a charge from another organisation', async () => {
    const other = await createTestOrganisation();

    const first = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    const second = await createCloudSubscriptionCheckout({
      organisationId: other.organisation.id,
      userId: other.user.id,
      now: NOW,
    });

    expect(second.id).not.toBe(first.id);
    expect(api.requests).toHaveLength(2);
  });

  it('leaves no charge behind when the provider fails', async () => {
    api.setNextResponse({ status: 500, body: '{}' });

    const error = await catchError(createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }));

    expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    expect(await countCharges()).toBe(0);
  });

  it('can start a checkout again after the provider failed', async () => {
    api.setNextResponse({ status: 500, body: '{}' });

    await catchError(createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }));

    const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

    expect(checkout.paymentUrl).not.toBeNull();
  });

  it('is not found when billing is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', '');

    const error = await catchError(createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }));

    expect(error.code).toBe(AppErrorCode.NOT_FOUND);
    expect(api.requests).toHaveLength(0);
    expect(await countCharges()).toBe(0);
  });

  it.each([
    'NEXT_PRIVATE_OPAPINGOU_API_KEY',
    'NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET',
  ])('is not set up without %s', async (variable) => {
    vi.stubEnv(variable, '');

    const error = await catchError(createCloudSubscriptionCheckout({ organisationId, userId, now: NOW }));

    expect(error.code).toBe(AppErrorCode.NOT_SETUP);
    expect(api.requests).toHaveLength(0);
    expect(await countCharges()).toBe(0);
  });

  describe('getCloudSubscription', () => {
    it('reports no subscription and no pending charge for a new organisation', async () => {
      const subscription = await getCloudSubscription({ organisationId, now: NOW });

      expect(subscription).toEqual({
        isBillingEnabled: true,
        isProviderConfigured: true,
        state: 'NONE',
        isSendingAllowed: false,
        priceCents: 9990,
        currency: 'BRL',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pendingCharge: null,
      });
    });

    it('includes the pending charge', async () => {
      const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

      const subscription = await getCloudSubscription({ organisationId, now: NOW });

      expect(subscription.state).toBe('NONE');
      expect(subscription.pendingCharge?.id).toBe(checkout.id);
    });

    it('hides a pending charge that expired', async () => {
      const checkout = await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW });

      await prisma.cloudSubscriptionCharge.update({
        where: { id: checkout.id },
        data: { expiresAt: new Date('2026-10-15T11:00:00.000Z') },
      });

      const subscription = await getCloudSubscription({ organisationId, now: NOW });

      expect(subscription.pendingCharge).toBeNull();
    });

    it('reports an active subscription', async () => {
      await prisma.cloudSubscription.create({
        data: {
          organisationId,
          currentPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z'),
        },
      });

      const subscription = await getCloudSubscription({ organisationId, now: NOW });

      expect(subscription.state).toBe('ACTIVE');
      expect(subscription.isSendingAllowed).toBe(true);
      expect(subscription.currentPeriodEnd?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('reports DISABLED when billing is off', async () => {
      vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', '');

      const subscription = await getCloudSubscription({ organisationId, now: NOW });

      expect(subscription.isBillingEnabled).toBe(false);
      expect(subscription.state).toBe('DISABLED');
      expect(subscription.isSendingAllowed).toBe(true);
    });
  });
});
