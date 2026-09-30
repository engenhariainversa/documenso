import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { hasTestDatabase } = vi.hoisted(() => {
  const databaseUrl = process.env.WAITLIST_TEST_DATABASE_URL;

  if (databaseUrl) {
    process.env.NEXT_PRIVATE_DATABASE_URL = databaseUrl;
    process.env.NEXT_PRIVATE_DIRECT_DATABASE_URL = databaseUrl;
  }

  return { hasTestDatabase: Boolean(databaseUrl) };
});

const { jobsClient } = vi.hoisted(() => ({
  jobsClient: { triggerJob: vi.fn().mockResolvedValue(undefined) },
}));

// The invite email goes through the jobs client, which needs the running app; here only
// the database side is exercised.
vi.mock('../../jobs/client', () => ({ jobsClient }));

import { prisma } from '@documenso/prisma';
import { OrganisationType } from '@prisma/client';

import { assertDisposableDatabaseUrl } from '../cloud-billing/test-database';
import { inviteWaitlistEntries } from './invite-waitlist-entries';

/**
 * Runs only against a disposable local database with the migrations applied
 * (`WAITLIST_TEST_DATABASE_URL`). Rows are isolated by a unique email prefix, since other
 * integration test files share the same database (see the DOC-30 lesson).
 */
describe.skipIf(!hasTestDatabase)('inviteWaitlistEntries (database)', () => {
  const prefix = `waitlist-it-${Date.now()}`;
  const email = `${prefix}@example.com`;

  let entryId: string;

  beforeAll(async () => {
    assertDisposableDatabaseUrl(process.env.WAITLIST_TEST_DATABASE_URL ?? '');

    const entry = await prisma.waitlistEntry.create({
      data: {
        name: 'Integration Person',
        email,
        phone: '+5562999999999',
        locale: 'pt-BR',
        consentVersion: '2026-09-29',
        consentedAt: new Date(),
      },
    });

    entryId = entry.id;
  });

  afterAll(async () => {
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });

    if (user) {
      await prisma.organisation.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }

    await prisma.waitlistEntry.deleteMany({ where: { id: entryId } });
    await prisma.$disconnect();
  });

  it('creates a password-less verified user with a personal organisation and stamps the entry', async () => {
    const { results } = await inviteWaitlistEntries({ ids: [entryId] });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('INVITED');

    const user = await prisma.user.findFirstOrThrow({
      where: { email },
      include: { organisationMember: { include: { organisation: true } } },
    });

    expect(user.name).toBe('Integration Person');
    expect(user.password).toBeNull();
    expect(user.emailVerified).toBeInstanceOf(Date);
    expect(user.organisationMember).toHaveLength(1);
    expect(user.organisationMember[0].organisation.type).toBe(OrganisationType.PERSONAL);

    const entry = await prisma.waitlistEntry.findFirstOrThrow({ where: { id: entryId } });

    expect(entry.invitedAt).toBeInstanceOf(Date);
    expect(entry.invitedUserId).toBe(user.id);

    expect(jobsClient.triggerJob).toHaveBeenCalledWith({
      name: 'send.waitlist.invite.email',
      payload: { waitlistEntryId: entryId, userId: user.id },
    });
  });

  it('reports EXISTING on a second invite and creates nothing new', async () => {
    jobsClient.triggerJob.mockClear();

    const { results } = await inviteWaitlistEntries({ ids: [entryId] });

    expect(results[0].status).toBe('EXISTING');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(jobsClient.triggerJob).not.toHaveBeenCalled();
  });
});
