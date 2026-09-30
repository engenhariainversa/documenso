import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, mailer, renderEmailWithI18N } = vi.hoisted(() => ({
  prisma: {
    waitlistEntry: { findFirstOrThrow: vi.fn() },
    user: { findFirstOrThrow: vi.fn() },
    passwordResetToken: { create: vi.fn() },
  },
  mailer: { sendMail: vi.fn() },
  renderEmailWithI18N: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma }));
vi.mock('@documenso/email/mailer', () => ({ mailer }));
vi.mock('../../../utils/render-email-with-i18n', () => ({ renderEmailWithI18N }));
vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: async () => ({
    _: (descriptor: { message?: string; id?: string }) => descriptor.message ?? descriptor.id ?? '',
  }),
}));

import type { JobRunIO } from '../../client/_internal/job';
import { run, WAITLIST_INVITE_TOKEN_TTL_MS } from './send-waitlist-invite-email.handler';

const io: JobRunIO = {
  runTask: async (_key, callback) => callback(),
  triggerJob: vi.fn(),
  wait: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
};

describe('send.waitlist.invite.email handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', 'https://docverse.example');

    prisma.waitlistEntry.findFirstOrThrow.mockResolvedValue({ id: 'entry_1', name: 'Ana Souza', locale: 'en' });
    prisma.user.findFirstOrThrow.mockResolvedValue({ id: 42, email: 'ana@exemplo.com', name: 'Ana Souza' });
    prisma.passwordResetToken.create.mockImplementation(async ({ data }) => data);
    renderEmailWithI18N.mockResolvedValue('rendered');
    mailer.sendMail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('creates a set-password token valid for a week and emails the link in the language of the entry', async () => {
    await run({ payload: { waitlistEntryId: 'entry_1', userId: 42 }, io });

    const { data } = prisma.passwordResetToken.create.mock.calls[0][0];

    expect(data.userId).toBe(42);
    expect(data.expiry.getTime() - Date.now()).toBe(WAITLIST_INVITE_TOKEN_TTL_MS);
    expect(WAITLIST_INVITE_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);

    expect(renderEmailWithI18N.mock.calls[0][1]).toMatchObject({ lang: 'en' });
    expect(renderEmailWithI18N.mock.calls[0][0].props.setPasswordLink).toBe(
      `https://docverse.example/reset-password/${data.token}`,
    );

    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: { address: 'ana@exemplo.com', name: 'Ana Souza' } }),
    );
  });
});
