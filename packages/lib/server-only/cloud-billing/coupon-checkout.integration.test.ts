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

import { AppError } from '../../errors/app-error';
import {
  type CreateCloudBillingCouponOptions,
  createCloudBillingCoupon,
  findCloudBillingCoupons,
  updateCloudBillingCoupon,
} from './coupons/manage-coupons';
import { createCloudSubscriptionCheckout } from './create-checkout';
import { getCloudSubscription } from './get-cloud-subscription';
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

// Before the fixed expiry of the simulated charges (2026-10-16T12:00Z), so pending
// charges are still payable. The organisations are this file's own.
const NOW = new Date('2026-10-15T18:00:00.000Z');

const catchErrorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return AppError.parseError(err).code;
  }

  throw new Error('Expected the promise to reject');
};

describe.skipIf(!hasTestDatabase)('cloud billing coupons', () => {
  let api: TSimulatedOpapingouApi;
  let organisationId: string;
  let otherOrganisationId: string;
  let userId: number;
  let otherUserId: number;

  // Coupon codes are global: each test gets its own.
  let codeCounter = 0;
  const runId = Math.random().toString(36).slice(2, 8).toUpperCase();

  const createCoupon = async (options: Partial<CreateCloudBillingCouponOptions> = {}) =>
    await createCloudBillingCoupon({
      code: `T${runId}-${++codeCounter}`,
      discountType: 'AMOUNT_OFF',
      discountValue: 9890,
      ...options,
    });

  const checkout = async (options: { couponCode?: string; isReplacement?: boolean; now?: Date } = {}) =>
    await createCloudSubscriptionCheckout({ organisationId, userId, now: NOW, ...options });

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.CLOUD_BILLING_TEST_DATABASE_URL ?? '');

    const first = await createTestOrganisation();
    const second = await createTestOrganisation();

    organisationId = first.organisation.id;
    userId = first.user.id;
    otherOrganisationId = second.organisation.id;
    otherUserId = second.user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetCloudBillingForOrganisations([organisationId, otherOrganisationId]);

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

  it('charges R$ 1,00 at the provider with a coupon of R$ 98,90 off', async () => {
    const coupon = await createCoupon();

    const result = await checkout({ couponCode: coupon.code.toLowerCase() });

    const charge = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: result.id } });

    expect(JSON.parse(api.requests[0].body)).toMatchObject({ amountCents: 100 });
    expect(charge).toMatchObject({ amountCents: 100, discountCents: 9890, couponId: coupon.id });
    expect(result).toMatchObject({ amountCents: 100, discountCents: 9890, couponCode: coupon.code });
  });

  it('activates the plan when the discounted charge is paid', async () => {
    const coupon = await createCoupon();

    const result = await checkout({ couponCode: coupon.code });

    const charge = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: result.id } });

    api.updateCharge(charge.providerChargeId ?? '', { status: 'PAID' });

    const { rawBody, signature } = api.buildSignedWebhook(
      {
        id: `evt:${organisationId}:coupon-paid`,
        type: 'charge.paid',
        occurredAt: NOW.toISOString(),
        testMode: true,
        data: { type: 'charge', object: { id: charge.providerChargeId } },
      },
      { timestamp: Math.floor(NOW.getTime() / 1000) },
    );

    const webhook = await handleOpapingouWebhook({ rawBody, signature, now: NOW });

    expect(webhook.outcome).toBe('PROCESSED');
    expect((await getCloudSubscription({ organisationId, now: NOW })).state).toBe('ACTIVE');
  });

  it('takes a percentage off', async () => {
    const coupon = await createCoupon({ discountType: 'PERCENT', discountValue: 50 });

    const result = await checkout({ couponCode: coupon.code });

    expect(result).toMatchObject({ amountCents: 4995, discountCents: 4995 });
  });

  it('refuses an unknown code without creating a charge', async () => {
    expect(await catchErrorCode(checkout({ couponCode: 'NAO-EXISTE' }))).toBe('COUPON_NOT_FOUND');
    expect(api.requests).toHaveLength(0);
  });

  it('refuses an inactive coupon', async () => {
    const coupon = await createCoupon();

    await updateCloudBillingCoupon({ id: coupon.id, isActive: false });

    expect(await catchErrorCode(checkout({ couponCode: coupon.code }))).toBe('COUPON_INACTIVE');
  });

  it('refuses a coupon outside its validity', async () => {
    const expired = await createCoupon({ validUntil: NOW });
    const future = await createCoupon({ validFrom: new Date(NOW.getTime() + 60_000) });

    expect(await catchErrorCode(checkout({ couponCode: expired.code }))).toBe('COUPON_EXPIRED');
    expect(await catchErrorCode(checkout({ couponCode: future.code }))).toBe('COUPON_NOT_STARTED');
  });

  it('gives the last redemption to a single organisation', async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });

    await checkout({ couponCode: coupon.code });

    const error = await catchErrorCode(
      createCloudSubscriptionCheckout({
        organisationId: otherOrganisationId,
        userId: otherUserId,
        couponCode: coupon.code,
        now: NOW,
      }),
    );

    expect(error).toBe('COUPON_EXHAUSTED');
  });

  it('frees the redemption of a pending charge whose Pix code expired', async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });

    await checkout({ couponCode: coupon.code });

    // After the expiry of the simulated charges, still within the 24 h reuse window.
    const later = new Date('2026-10-16T13:00:00.000Z');

    const other = await createCloudSubscriptionCheckout({
      organisationId: otherOrganisationId,
      userId: otherUserId,
      couponCode: coupon.code,
      now: later,
    });

    expect(other.amountCents).toBe(100);
  });

  it('hands back the pending discounted charge on a second call with the same code', async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });

    const first = await checkout({ couponCode: coupon.code });
    const second = await checkout({ couponCode: coupon.code });

    expect(second.id).toBe(first.id);
    expect(api.requests).toHaveLength(1);
  });

  it('keeps the discounted pending charge on a call without a code', async () => {
    const coupon = await createCoupon();

    const first = await checkout({ couponCode: coupon.code });
    const second = await checkout();

    expect(second.id).toBe(first.id);
    expect(second.amountCents).toBe(100);
  });

  it('replaces a full price pending charge when a coupon is applied', async () => {
    const coupon = await createCoupon();

    const full = await checkout();
    const discounted = await checkout({ couponCode: coupon.code });

    expect(discounted.id).not.toBe(full.id);
    expect(discounted.amountCents).toBe(100);
    expect((await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: full.id } })).status).toBe(
      CloudSubscriptionChargeStatus.EXPIRED,
    );
  });

  it('keeps the coupon when a new Pix code is generated, without counting it twice', async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });

    const first = await checkout({ couponCode: coupon.code });
    const replaced = await checkout({ isReplacement: true });

    expect(replaced.id).not.toBe(first.id);
    expect(replaced).toMatchObject({ amountCents: 100, couponCode: coupon.code });
  });

  it('keeps the pending charge when the coupon is refused', async () => {
    const full = await checkout();

    await catchErrorCode(checkout({ couponCode: 'NAO-EXISTE' }));

    expect((await prisma.cloudSubscriptionCharge.findUniqueOrThrow({ where: { id: full.id } })).status).toBe(
      CloudSubscriptionChargeStatus.PENDING,
    );
  });

  it('lists the coupons with their redemptions and final price', async () => {
    const coupon = await createCoupon({ maxRedemptions: 5 });

    await checkout({ couponCode: coupon.code });

    const listed = (await findCloudBillingCoupons(NOW)).find((item) => item.id === coupon.id);

    expect(listed).toMatchObject({ paidRedemptions: 0, pendingRedemptions: 1, finalAmountCents: 100 });
  });

  describe('admin rules', () => {
    it('refuses a duplicate code, whatever the case', async () => {
      const coupon = await createCoupon();

      expect(await catchErrorCode(createCoupon({ code: coupon.code.toLowerCase() }))).toBe('ALREADY_EXISTS');
    });

    it.each([
      ['a code with spaces', { code: 'COM ESPACO' }],
      ['a discount that makes the plan free', { discountValue: 9990 }],
      ['100% off', { discountType: 'PERCENT' as const, discountValue: 100 }],
      ['an end before the start', { validFrom: NOW, validUntil: new Date(NOW.getTime() - 1) }],
    ])('refuses %s', async (_label, options) => {
      expect(await catchErrorCode(createCoupon(options))).toBe('INVALID_BODY');
    });
  });
});
