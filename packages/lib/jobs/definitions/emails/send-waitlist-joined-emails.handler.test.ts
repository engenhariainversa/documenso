import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, mailer, renderEmailWithI18N } = vi.hoisted(() => ({
  prisma: {
    waitlistEntry: {
      findFirstOrThrow: vi.fn(),
    },
  },
  mailer: {
    sendMail: vi.fn(),
  },
  renderEmailWithI18N: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma }));
vi.mock('@documenso/email/mailer', () => ({ mailer }));
vi.mock('../../../utils/render-email-with-i18n', () => ({ renderEmailWithI18N }));
// The real `_` interpolates the macro values ("{0}") into the message; the stub does the same.
vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: async () => ({
    _: (descriptor: { message?: string; id?: string; values?: Record<string, unknown> }) =>
      (descriptor.message ?? descriptor.id ?? '').replace(/\{(\w+)\}/g, (_match, key: string) =>
        String(descriptor.values?.[key] ?? ''),
      ),
  }),
}));

import type { JobRunIO } from '../../client/_internal/job';
import { run } from './send-waitlist-joined-emails.handler';

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

const io: JobRunIO = {
  runTask: async (_key, callback) => callback(),
  triggerJob: vi.fn(),
  wait: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
};

describe('send.waitlist.joined.emails handler', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', 'https://docverse.example');
    vi.stubEnv('NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL', '');

    prisma.waitlistEntry.findFirstOrThrow.mockResolvedValue(ENTRY);
    renderEmailWithI18N.mockImplementation(async (_element, options?: { plainText?: boolean }) =>
      options?.plainText ? 'text' : '<html>',
    );
    mailer.sendMail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('sends the confirmation to the person in the language of the entry and nothing else by default', async () => {
    await run({ payload: { waitlistEntryId: 'entry_1' }, io });

    expect(prisma.waitlistEntry.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 'entry_1' } });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { address: 'ana@exemplo.com', name: 'Ana Souza' },
        html: '<html>',
        text: 'text',
      }),
    );

    for (const call of renderEmailWithI18N.mock.calls) {
      expect(call[1]).toMatchObject({ lang: 'pt-BR' });
    }
  });

  it('also notifies the configured address, in pt-BR, with a link to the admin page', async () => {
    vi.stubEnv('NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL', 'dona@exemplo.com');

    await run({ payload: { waitlistEntryId: 'entry_1' }, io });

    expect(mailer.sendMail).toHaveBeenCalledTimes(2);

    const notice = mailer.sendMail.mock.calls[1][0];

    expect(notice.to).toEqual({ address: 'dona@exemplo.com', name: '' });
    expect(notice.subject).toContain('Ana Souza');

    const noticeRender = renderEmailWithI18N.mock.calls.at(-1);

    expect(noticeRender?.[1]).toMatchObject({ lang: 'pt-BR' });
    expect(noticeRender?.[0].props).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      phone: '+5562999999999',
      adminUrl: 'https://docverse.example/admin/waitlist',
    });
  });

  it('renders the confirmation in English for an English entry', async () => {
    prisma.waitlistEntry.findFirstOrThrow.mockResolvedValue({ ...ENTRY, locale: 'en' });

    await run({ payload: { waitlistEntryId: 'entry_1' }, io });

    expect(renderEmailWithI18N.mock.calls[0][1]).toMatchObject({ lang: 'en' });
  });
});
