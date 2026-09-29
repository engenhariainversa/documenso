import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { databaseCalls } = vi.hoisted(() => ({ databaseCalls: [] as string[] }));

vi.mock('@documenso/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, property) => {
        databaseCalls.push(String(property));

        throw new Error(`Unexpected database access: ${String(property)}`);
      },
    },
  ),
}));

import { AppError } from '../../errors/app-error';
import {
  assertOrganisationCanSendDocuments,
  assertSendingAllowed,
  SUBSCRIPTION_REQUIRED_ERROR_CODE,
} from './assert-organisation-can-send';

describe('assertSendingAllowed', () => {
  it.each(['DISABLED', 'ACTIVE', 'GRACE'] as const)('does not throw when %s', (state) => {
    expect(() => assertSendingAllowed(state)).not.toThrow();
  });

  it.each(['NONE', 'EXPIRED'] as const)('requires a subscription when %s', (state) => {
    let error: AppError | null = null;

    try {
      assertSendingAllowed(state);
    } catch (err) {
      error = AppError.parseError(err);
    }

    expect(error?.code).toBe(SUBSCRIPTION_REQUIRED_ERROR_CODE);
    expect(error?.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(error?.statusCode).toBe(402);
  });
});

describe('assertOrganisationCanSendDocuments with billing disabled', () => {
  beforeEach(() => {
    databaseCalls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, '', 'false'])('allows sending without touching the database (%j)', async (value) => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', value);

    await expect(assertOrganisationCanSendDocuments({ teamId: 1 })).resolves.toBeUndefined();

    expect(databaseCalls).toEqual([]);
  });
});
