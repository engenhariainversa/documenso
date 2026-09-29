import { prisma } from '@documenso/prisma';
import type { OrganisationMemberRole } from '@prisma/client';
import { DocumentSource, DocumentStatus, EnvelopeType, OrganisationGroupType, OrganisationType } from '@prisma/client';

import { SignatureLevel } from '../../types/signature-level';
import { INTERNAL_CLAIM_ID } from '../../types/subscription';
import { alphaid, generateDatabaseId, prefixedId } from '../../universal/id';
import { incrementDocumentId, incrementTemplateId } from '../envelope/increment-id';
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

/**
 * Removes the billing rows of the given organisations only.
 *
 * Test files run in parallel against the same database, so a test must never
 * delete or count rows that belong to another file's organisation.
 */
export const resetCloudBillingForOrganisations = async (organisationIds: string[]) => {
  const charges = await prisma.cloudSubscriptionCharge.findMany({
    where: {
      organisationId: {
        in: organisationIds,
      },
    },
    select: {
      id: true,
    },
  });

  await prisma.cloudBillingWebhookEvent.deleteMany({
    where: {
      OR: [
        {
          chargeId: {
            in: charges.map((charge) => charge.id),
          },
        },
        ...organisationIds.map((organisationId) => ({
          eventId: {
            startsWith: `${organisationId}:`,
          },
        })),
      ],
    },
  });

  await prisma.cloudSubscriptionCharge.deleteMany({
    where: {
      organisationId: {
        in: organisationIds,
      },
    },
  });

  await prisma.cloudSubscription.deleteMany({
    where: {
      organisationId: {
        in: organisationIds,
      },
    },
  });
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

export type CreateTestEnvelopeOptions = {
  userId: number;
  teamId: number;
  type: EnvelopeType;
  status?: DocumentStatus;
};

/**
 * An envelope without recipients, items or fields.
 *
 * It is enough to tell whether a send was refused by the subscription gate or went
 * past it: past the gate, sending fails on the missing recipients or items.
 */
export const createTestEnvelope = async ({
  userId,
  teamId,
  type,
  status = DocumentStatus.DRAFT,
}: CreateTestEnvelopeOptions) => {
  const documentMeta = await prisma.documentMeta.create({
    data: {},
  });

  const secondaryId =
    type === EnvelopeType.DOCUMENT
      ? (await incrementDocumentId()).formattedDocumentId
      : (await incrementTemplateId()).formattedTemplateId;

  return await prisma.envelope.create({
    data: {
      id: prefixedId('envelope'),
      secondaryId,
      internalVersion: 1,
      signatureLevel: SignatureLevel.SES,
      type,
      status,
      source: type === EnvelopeType.DOCUMENT ? DocumentSource.DOCUMENT : DocumentSource.TEMPLATE,
      title: '[TEST] Cloud billing',
      documentMetaId: documentMeta.id,
      userId,
      teamId,
    },
  });
};

export type AddTestOrganisationMemberOptions = {
  organisationId: string;
  role: OrganisationMemberRole;
};

/**
 * Adds a new user to the organisation, in the internal group of the given role.
 */
export const addTestOrganisationMember = async ({ organisationId, role }: AddTestOrganisationMemberOptions) => {
  const suffix = alphaid(12);

  const user = await prisma.user.create({
    data: {
      name: `Billing Test Member ${suffix}`,
      email: `billing-test-member-${suffix}@docverse.invalid`,
      emailVerified: new Date(),
    },
  });

  const group = await prisma.organisationGroup.findFirstOrThrow({
    where: {
      organisationId,
      type: OrganisationGroupType.INTERNAL_ORGANISATION,
      organisationRole: role,
    },
  });

  await prisma.organisationMember.create({
    data: {
      id: generateDatabaseId('member'),
      userId: user.id,
      organisationId,
      organisationGroupMembers: {
        create: {
          id: generateDatabaseId('group_member'),
          groupId: group.id,
        },
      },
    },
  });

  return user;
};
