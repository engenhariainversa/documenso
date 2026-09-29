import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { hasTestDatabase } = vi.hoisted(() => {
  const databaseUrl = process.env.CLOUD_BILLING_TEST_DATABASE_URL;

  if (databaseUrl) {
    process.env.NEXT_PRIVATE_DATABASE_URL = databaseUrl;
    process.env.NEXT_PRIVATE_DIRECT_DATABASE_URL = databaseUrl;
  }

  return { hasTestDatabase: Boolean(databaseUrl) };
});

import { prisma } from '@documenso/prisma';
import { OrganisationMemberRole } from '@prisma/client';

import { AppError } from '../../errors/app-error';
import { assertUserCanManageOrganisationBilling } from './assert-user-can-manage-billing';
import { addTestOrganisationMember, assertDisposableDatabaseUrl, createTestOrganisation } from './test-database';

const catchError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return AppError.parseError(err);
  }

  return null;
};

describe.skipIf(!hasTestDatabase)('assertUserCanManageOrganisationBilling', () => {
  let organisationId: string;
  let adminUserId: number;

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.CLOUD_BILLING_TEST_DATABASE_URL ?? '');

    const { organisation, user } = await createTestOrganisation();

    organisationId = organisation.id;
    adminUserId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows an admin of the organisation', async () => {
    const error = await catchError(assertUserCanManageOrganisationBilling({ organisationId, userId: adminUserId }));

    expect(error).toBeNull();
  });

  it.each([
    OrganisationMemberRole.MANAGER,
    OrganisationMemberRole.MEMBER,
  ])('hides the organisation from a %s', async (role) => {
    const member = await addTestOrganisationMember({ organisationId, role });

    const error = await catchError(assertUserCanManageOrganisationBilling({ organisationId, userId: member.id }));

    expect(error?.code).toBe('NOT_FOUND');
  });

  it('hides the organisation from the admin of another organisation', async () => {
    const other = await createTestOrganisation();

    const error = await catchError(assertUserCanManageOrganisationBilling({ organisationId, userId: other.user.id }));

    expect(error?.code).toBe('NOT_FOUND');
  });

  it('is not found for an organisation that does not exist', async () => {
    const error = await catchError(
      assertUserCanManageOrganisationBilling({ organisationId: 'org_does_not_exist', userId: adminUserId }),
    );

    expect(error?.code).toBe('NOT_FOUND');
  });
});
