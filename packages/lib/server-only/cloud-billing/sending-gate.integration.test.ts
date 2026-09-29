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
import { DocumentStatus, EnvelopeType } from '@prisma/client';

import { AppError } from '../../errors/app-error';
import {
  assertDisposableDatabaseUrl,
  createTestEnvelope,
  createTestOrganisation,
  resetCloudBillingForOrganisations,
} from './test-database';

/**
 * The sending functions load the compiled translation catalogs when imported, and
 * those are build artifacts (`npm run translate:compile`). They are imported lazily,
 * so this file stays harmless when it is skipped on a checkout without them.
 */
const loadSendingFunctions = async () => {
  const [{ sendDocument }, { resendDocument }, { createDocumentFromDirectTemplate }] = await Promise.all([
    import('../document/send-document'),
    import('../document/resend-document'),
    import('../template/create-document-from-direct-template'),
  ]);

  return { sendDocument, resendDocument, createDocumentFromDirectTemplate };
};

const REQUEST_METADATA = {
  requestMetadata: {},
  source: 'app' as const,
  auth: 'session' as const,
};

/**
 * The envelopes used here have no recipients and no items, so a send that gets
 * past the subscription gate fails right after it, on a different error.
 */
const PAST_THE_GATE_DOCUMENT_ERROR = 'Document has no recipients';
const PAST_THE_GATE_TEMPLATE_ERROR = 'Invalid number of envelope items';

const catchError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return AppError.parseError(err);
  }

  throw new Error('Expected the promise to reject');
};

describe.skipIf(!hasTestDatabase)('subscription gate on the sending paths', () => {
  let organisationId: string;
  let teamId: number;
  let userId: number;
  let draftId: string;
  let pendingId: string;
  let directTemplateToken: string;
  let sending: Awaited<ReturnType<typeof loadSendingFunctions>>;

  const subscribe = async () => {
    await prisma.cloudSubscription.create({
      data: {
        organisationId,
        currentPeriodStart: new Date('2020-01-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2999-01-01T00:00:00.000Z'),
      },
    });
  };

  const send = async () =>
    await catchError(
      sending.sendDocument({
        id: { type: 'envelopeId', id: draftId },
        userId,
        teamId,
        sendEmail: false,
        requestMetadata: REQUEST_METADATA,
      }),
    );

  const resend = async () =>
    await catchError(
      sending.resendDocument({
        id: { type: 'envelopeId', id: pendingId },
        userId,
        teamId,
        recipients: [],
        requestMetadata: REQUEST_METADATA,
      }),
    );

  const useDirectTemplate = async () =>
    await catchError(
      sending.createDocumentFromDirectTemplate({
        directRecipientEmail: 'signer@docverse.invalid',
        directTemplateToken,
        signedFieldValues: [],
        templateUpdatedAt: new Date(),
        requestMetadata: REQUEST_METADATA,
      }),
    );

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.CLOUD_BILLING_TEST_DATABASE_URL ?? '');

    sending = await loadSendingFunctions();

    const { organisation, team, user } = await createTestOrganisation();

    organisationId = organisation.id;
    teamId = team.id;
    userId = user.id;

    const draft = await createTestEnvelope({ userId, teamId, type: EnvelopeType.DOCUMENT });

    const pending = await createTestEnvelope({
      userId,
      teamId,
      type: EnvelopeType.DOCUMENT,
      status: DocumentStatus.PENDING,
    });

    const template = await createTestEnvelope({ userId, teamId, type: EnvelopeType.TEMPLATE });

    const directLink = await prisma.templateDirectLink.create({
      data: {
        envelopeId: template.id,
        token: `billing-test-${template.id}`,
        enabled: true,
        directTemplateRecipientId: 0,
      },
    });

    draftId = draft.id;
    pendingId = pending.id;
    directTemplateToken = directLink.token;
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

  describe('without a subscription', () => {
    it('refuses to send a document', async () => {
      const error = await send();

      expect(error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(error.statusCode).toBe(402);
    });

    it('leaves the document as a draft', async () => {
      await send();

      const envelope = await prisma.envelope.findUniqueOrThrow({ where: { id: draftId } });

      expect(envelope.status).toBe(DocumentStatus.DRAFT);
    });

    it('refuses to resend a document', async () => {
      const error = await resend();

      expect(error.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('refuses to create a document from a direct template', async () => {
      const error = await useDirectTemplate();

      expect(error.code).toBe('SUBSCRIPTION_REQUIRED');
    });
  });

  describe('with an active subscription', () => {
    beforeEach(async () => {
      await subscribe();
    });

    it('lets a send through', async () => {
      expect((await send()).message).toBe(PAST_THE_GATE_DOCUMENT_ERROR);
    });

    it('lets a resend through', async () => {
      expect((await resend()).message).toBe(PAST_THE_GATE_DOCUMENT_ERROR);
    });

    it('lets a direct template through', async () => {
      expect((await useDirectTemplate()).message).toBe(PAST_THE_GATE_TEMPLATE_ERROR);
    });
  });

  describe('with billing disabled', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', '');
    });

    it('lets a send through without a subscription', async () => {
      expect((await send()).message).toBe(PAST_THE_GATE_DOCUMENT_ERROR);
    });

    it('lets a resend through without a subscription', async () => {
      expect((await resend()).message).toBe(PAST_THE_GATE_DOCUMENT_ERROR);
    });

    it('lets a direct template through without a subscription', async () => {
      expect((await useDirectTemplate()).message).toBe(PAST_THE_GATE_TEMPLATE_ERROR);
    });
  });

  it('does not let a member of another organisation probe the subscription', async () => {
    const outsider = await createTestOrganisation();

    const error = await catchError(
      sending.sendDocument({
        id: { type: 'envelopeId', id: draftId },
        userId: outsider.user.id,
        teamId,
        sendEmail: false,
        requestMetadata: REQUEST_METADATA,
      }),
    );

    expect(error.code).not.toBe('SUBSCRIPTION_REQUIRED');
  });
});
