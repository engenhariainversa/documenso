import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, jobsClient, onCreateUserHook } = vi.hoisted(() => ({
  prisma: {
    waitlistEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    organisationMember: {
      count: vi.fn(),
    },
  },
  jobsClient: {
    triggerJob: vi.fn(),
  },
  onCreateUserHook: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma }));
vi.mock('../../jobs/client', () => ({ jobsClient }));
vi.mock('../user/create-user', () => ({ onCreateUserHook }));

import { inviteWaitlistEntries } from './invite-waitlist-entries';

const ENTRY = {
  id: 'entry_1',
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '+5562999999999',
  locale: 'pt-BR',
  source: 'landing',
  consentVersion: '2026-09-29',
  consentedAt: new Date('2026-09-29T12:00:00Z'),
  createdAt: new Date('2026-09-29T12:00:00Z'),
  invitedAt: null,
  invitedUserId: null,
};

describe('inviteWaitlistEntries', () => {
  beforeEach(() => {
    prisma.waitlistEntry.findMany.mockResolvedValue([ENTRY]);
    prisma.waitlistEntry.update.mockResolvedValue(ENTRY);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.organisationMember.count.mockResolvedValue(1);
    prisma.user.create.mockImplementation(async ({ data }) => ({ id: 42, ...data }));
    onCreateUserHook.mockResolvedValue(undefined);
    jobsClient.triggerJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports an unknown id without creating anything', async () => {
    prisma.waitlistEntry.findMany.mockResolvedValue([]);

    const { results } = await inviteWaitlistEntries({ ids: ['missing'] });

    expect(results).toEqual([{ id: 'missing', status: 'NOT_FOUND' }]);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jobsClient.triggerJob).not.toHaveBeenCalled();
  });

  it('creates the account without a password, with a verified email and a personal organisation, then emails the invite', async () => {
    const { results } = await inviteWaitlistEntries({ ids: ['entry_1'] });

    expect(results).toEqual([{ id: 'entry_1', status: 'INVITED', userId: 42 }]);

    const { data } = prisma.user.create.mock.calls[0][0];

    expect(data).toMatchObject({ name: 'Ana Souza', email: 'ana@exemplo.com', password: null });
    expect(data.emailVerified).toBeInstanceOf(Date);

    expect(onCreateUserHook).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));

    expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry_1' },
      data: { invitedAt: expect.any(Date), invitedUserId: 42 },
    });

    expect(jobsClient.triggerJob).toHaveBeenCalledWith({
      name: 'send.waitlist.invite.email',
      payload: { waitlistEntryId: 'entry_1', userId: 42 },
    });
  });

  it('looks the account up without case sensitivity, since OAuth keeps the provider casing', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 7, email: 'Ana@Exemplo.com', password: 'hash' });

    await inviteWaitlistEntries({ ids: ['entry_1'] });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'ana@exemplo.com', mode: 'insensitive' } } }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('resends the invite when the account was created by this entry and still has no password', async () => {
    prisma.waitlistEntry.findMany.mockResolvedValue([
      { ...ENTRY, invitedAt: new Date('2026-10-01T00:00:00Z'), invitedUserId: 42 },
    ]);
    prisma.user.findFirst.mockResolvedValue({ id: 42, email: 'ana@exemplo.com', password: null });

    const { results } = await inviteWaitlistEntries({ ids: ['entry_1'] });

    expect(results).toEqual([{ id: 'entry_1', status: 'RESENT', userId: 42 }]);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(jobsClient.triggerJob).toHaveBeenCalledWith({
      name: 'send.waitlist.invite.email',
      payload: { waitlistEntryId: 'entry_1', userId: 42 },
    });
    expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry_1' },
      data: { invitedAt: expect.any(Date), invitedUserId: 42 },
    });
  });

  it('recovers a half-finished invite by creating the missing personal organisation before resending', async () => {
    prisma.waitlistEntry.findMany.mockResolvedValue([{ ...ENTRY, invitedUserId: 42 }]);
    prisma.user.findFirst.mockResolvedValue({ id: 42, email: 'ana@exemplo.com', password: null });
    prisma.organisationMember.count.mockResolvedValue(0);

    const { results } = await inviteWaitlistEntries({ ids: ['entry_1'] });

    expect(results).toEqual([{ id: 'entry_1', status: 'RESENT', userId: 42 }]);
    expect(onCreateUserHook).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('only stamps the invite when the email already has an account, without creating or emailing', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 7, email: 'ana@exemplo.com', password: 'hash' });

    const { results } = await inviteWaitlistEntries({ ids: ['entry_1'] });

    expect(results).toEqual([{ id: 'entry_1', status: 'EXISTING', userId: 7 }]);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(onCreateUserHook).not.toHaveBeenCalled();
    expect(jobsClient.triggerJob).not.toHaveBeenCalled();
    expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry_1' },
      data: { invitedAt: expect.any(Date), invitedUserId: 7 },
    });
  });

  it('keeps going after a failure and reports it on that entry only', async () => {
    const second = { ...ENTRY, id: 'entry_2', email: 'bia@exemplo.com', name: 'Bia Lima' };

    prisma.waitlistEntry.findMany.mockResolvedValue([ENTRY, second]);
    prisma.user.create
      .mockRejectedValueOnce(new Error('database is on fire'))
      .mockImplementationOnce(async ({ data }) => ({ id: 43, ...data }));

    const { results } = await inviteWaitlistEntries({ ids: ['entry_1', 'entry_2'] });

    expect(results).toEqual([
      { id: 'entry_1', status: 'FAILED', error: 'database is on fire' },
      { id: 'entry_2', status: 'INVITED', userId: 43 },
    ]);
  });
});
