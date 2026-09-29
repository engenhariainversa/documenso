import { prisma } from '@documenso/prisma';
import { OrganisationType } from '@prisma/client';

import { INTERNAL_CLAIM_ID } from '../../types/subscription';
import { alphaid } from '../../universal/id';
import { createOrganisation } from '../organisation/create-organisation';
import { getSubscriptionClaim } from '../subscription/get-subscription-claim';
import { createTeam } from '../team/create-team';

/**
 * Helpers for the cloud billing integration tests.
 *
 * Those tests only run when CLOUD_BILLING_TEST_DATABASE_URL points to a disposable
 * local Postgres with the migrations applied. They delete rows, so the URL is
 * checked before anything is touched.
 */
export const LOCAL_DATABASE_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

/**
 * Throws unless the URL is a local database whose name contains "test".
 */
export const assertDisposableDatabaseUrl = (databaseUrl: string) => {
  const { hostname, pathname } = new URL(databaseUrl.replace(/^postgres(ql)?:\/\//, 'https://'));

  if (!LOCAL_DATABASE_HOSTS.includes(hostname)) {
    throw new Error('Cloud billing integration tests only run against a local database');
  }

  if (!pathname.toLowerCase().includes('test')) {
    throw new Error('Cloud billing integration tests only run against a database named "*test*"');
  }
};

export const resetCloudBillingTables = async () => {
  await prisma.cloudBillingWebhookEvent.deleteMany();
  await prisma.cloudSubscriptionCharge.deleteMany();
  await prisma.cloudSubscription.deleteMany();
};

export const createTestOrganisation = async () => {
  const suffix = alphaid(12);

  const user = await prisma.user.create({
    data: {
      name: `Billing Test ${suffix}`,
      email: `billing-test-${suffix}@docverse.invalid`,
      emailVerified: new Date(),
    },
  });

  const organisation = await createOrganisation({
    userId: user.id,
    name: `Billing Test Org ${suffix}`,
    type: OrganisationType.ORGANISATION,
    claim: await getSubscriptionClaim(INTERNAL_CLAIM_ID.FREE),
  });

  await createTeam({
    userId: user.id,
    teamName: `Billing Test Team ${suffix}`,
    teamUrl: `billing-test-team-${suffix}`,
    organisationId: organisation.id,
    inheritMembers: true,
  });

  const team = await prisma.team.findFirstOrThrow({
    where: {
      organisationId: organisation.id,
    },
  });

  return {
    user,
    organisation,
    team,
  };
};
