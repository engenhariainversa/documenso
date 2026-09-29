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
import { EnvelopeType } from '@prisma/client';

import { AppError } from '../../errors/app-error';
import { getServerLimits } from '../limits/get-server-limits';
import {
  assertOrganisationCanSendDocuments,
  isDirectTemplateAvailable,
  isOrganisationSendingAllowed,
} from './assert-organisation-can-send';
import {
  assertDisposableDatabaseUrl,
  createTestEnvelope,
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

  return null;
};

describe.skipIf(!hasTestDatabase)('sending gate with billing enabled', () => {
  let organisationId: string;
  let teamId: number;
  let userId: number;

  const setPeriodEnd = async (currentPeriodEnd: Date) => {
    await prisma.cloudSubscription.create({
      data: {
        organisationId,
        currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
        currentPeriodEnd,
      },
    });
  };

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.CLOUD_BILLING_TEST_DATABASE_URL ?? '');

    const { organisation, team, user } = await createTestOrganisation();

    organisationId = organisation.id;
    teamId = team.id;
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetCloudBillingForOrganisations([organisationId]);

    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('assertOrganisationCanSendDocuments', () => {
    it('requires a subscription for an organisation that never paid', async () => {
      const error = await catchError(assertOrganisationCanSendDocuments({ teamId, now: NOW }));

      expect(error?.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('allows sending inside the paid period', async () => {
      await setPeriodEnd(new Date('2026-11-01T00:00:00.000Z'));

      expect(await catchError(assertOrganisationCanSendDocuments({ teamId, now: NOW }))).toBeNull();
    });

    it('allows sending during the grace period', async () => {
      await setPeriodEnd(new Date('2026-10-14T00:00:00.000Z'));

      expect(await catchError(assertOrganisationCanSendDocuments({ teamId, now: NOW }))).toBeNull();
    });

    it('requires a subscription after the grace period', async () => {
      await setPeriodEnd(new Date('2026-10-01T00:00:00.000Z'));

      const error = await catchError(assertOrganisationCanSendDocuments({ teamId, now: NOW }));

      expect(error?.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('is not fooled by the subscription of another organisation', async () => {
      const other = await createTestOrganisation();

      await prisma.cloudSubscription.create({
        data: {
          organisationId: other.organisation.id,
          currentPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z'),
        },
      });

      const error = await catchError(assertOrganisationCanSendDocuments({ teamId, now: NOW }));

      expect(error?.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('is not found for a team that does not exist', async () => {
      const error = await catchError(assertOrganisationCanSendDocuments({ teamId: 2_000_000_000, now: NOW }));

      expect(error?.code).toBe('NOT_FOUND');
    });
  });

  describe('isOrganisationSendingAllowed', () => {
    it('is false for an organisation that never paid', async () => {
      expect(await isOrganisationSendingAllowed({ teamId, now: NOW })).toBe(false);
    });

    it('is true inside the paid period', async () => {
      await setPeriodEnd(new Date('2026-11-01T00:00:00.000Z'));

      expect(await isOrganisationSendingAllowed({ teamId, now: NOW })).toBe(true);
    });

    it('is false after the grace period', async () => {
      await setPeriodEnd(new Date('2026-10-01T00:00:00.000Z'));

      expect(await isOrganisationSendingAllowed({ teamId, now: NOW })).toBe(false);
    });

    it('is false for a team that does not exist', async () => {
      expect(await isOrganisationSendingAllowed({ teamId: 2_000_000_000, now: NOW })).toBe(false);
    });
  });

  describe('isDirectTemplateAvailable', () => {
    let token: string;

    beforeAll(async () => {
      const template = await createTestEnvelope({ userId, teamId, type: EnvelopeType.TEMPLATE });

      const directLink = await prisma.templateDirectLink.create({
        data: {
          envelopeId: template.id,
          token: `billing-availability-${template.id}`,
          enabled: true,
          directTemplateRecipientId: 0,
        },
      });

      token = directLink.token;
    });

    it('is unavailable when the organisation has no plan', async () => {
      expect(await isDirectTemplateAvailable({ token, now: NOW })).toBe(false);
    });

    it('is available when the organisation has an active plan', async () => {
      await setPeriodEnd(new Date('2026-11-01T00:00:00.000Z'));

      expect(await isDirectTemplateAvailable({ token, now: NOW })).toBe(true);
    });

    it('is unavailable for a token that does not exist', async () => {
      expect(await isDirectTemplateAvailable({ token: 'does-not-exist', now: NOW })).toBe(false);
    });
  });

  describe('getServerLimits', () => {
    it('keeps quotas unlimited but blocks sending without a subscription', async () => {
      const limits = await getServerLimits({ userId, teamId, now: NOW });

      expect(limits.quota.documents).toBe(Infinity);
      expect(limits.remaining.documents).toBe(Infinity);
      expect(limits.subscription).toEqual({ state: 'NONE', isSendingAllowed: false });
    });

    it('allows sending with an active subscription', async () => {
      await setPeriodEnd(new Date('2026-11-01T00:00:00.000Z'));

      const limits = await getServerLimits({ userId, teamId, now: NOW });

      expect(limits.subscription).toEqual({ state: 'ACTIVE', isSendingAllowed: true });
    });

    it('reports DISABLED when billing is off', async () => {
      vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', '');

      const limits = await getServerLimits({ userId, teamId, now: NOW });

      expect(limits.subscription).toEqual({ state: 'DISABLED', isSendingAllowed: true });
    });
  });
});
