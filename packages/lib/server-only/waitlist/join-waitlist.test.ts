import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, AppErrorCode } from '../../errors/app-error';

const { prisma, jobsClient, waitlistJoinRateLimit, verifyCaptchaToken } = vi.hoisted(() => ({
  prisma: {
    waitlistEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  jobsClient: {
    triggerJob: vi.fn(),
  },
  waitlistJoinRateLimit: {
    check: vi.fn(),
  },
  verifyCaptchaToken: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma }));
vi.mock('../../jobs/client', () => ({ jobsClient }));
vi.mock('../rate-limit/rate-limits', () => ({ waitlistJoinRateLimit }));
vi.mock('../captcha/verify-captcha', () => ({ verifyCaptchaToken }));

import { joinWaitlist, WAITLIST_DISPOSABLE_EMAIL_MESSAGE } from './join-waitlist';

const INPUT = {
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phoneCountry: '55',
  phoneArea: '62',
  phoneNumber: '999999999',
  locale: 'pt-BR' as const,
  consent: true as const,
  consentVersion: '2026-09-29',
};

const IP = '203.0.113.7';

const expectAppError = async (promise: Promise<unknown>, code: AppErrorCode) => {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );

  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
};

describe('joinWaitlist', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', 'true');

    waitlistJoinRateLimit.check.mockResolvedValue({ isLimited: false, remaining: 4, limit: 5, reset: new Date() });
    verifyCaptchaToken.mockResolvedValue(undefined);
    prisma.waitlistEntry.findUnique.mockResolvedValue(null);
    prisma.waitlistEntry.create.mockImplementation(async ({ data }) => ({ id: 'entry_1', ...data }));
    jobsClient.triggerJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('is not found when the waitlist is off, before touching the database', async () => {
    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', '');

    await expectAppError(joinWaitlist({ input: INPUT, ipAddress: IP }), AppErrorCode.NOT_FOUND);

    expect(prisma.waitlistEntry.findUnique).not.toHaveBeenCalled();
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it('refuses when the address hit the rate limit, before touching the database', async () => {
    waitlistJoinRateLimit.check.mockResolvedValue({ isLimited: true, remaining: 0, limit: 5, reset: new Date() });

    await expectAppError(joinWaitlist({ input: INPUT, ipAddress: IP }), AppErrorCode.TOO_MANY_REQUESTS);

    expect(waitlistJoinRateLimit.check).toHaveBeenCalledWith({ ip: IP });
    expect(prisma.waitlistEntry.findUnique).not.toHaveBeenCalled();
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it('answers ok to a filled honeypot without storing or emailing anything', async () => {
    const result = await joinWaitlist({ input: { ...INPUT, website: 'https://bot.example' }, ipAddress: IP });

    expect(result).toEqual({ ok: true });
    expect(prisma.waitlistEntry.findUnique).not.toHaveBeenCalled();
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
    expect(jobsClient.triggerJob).not.toHaveBeenCalled();
  });

  it('verifies the captcha with the token and the address', async () => {
    await joinWaitlist({ input: { ...INPUT, captchaToken: 'tok' }, ipAddress: IP });

    expect(verifyCaptchaToken).toHaveBeenCalledWith({ token: 'tok', ipAddress: IP });
  });

  it('refuses a disposable email with a message the landing can recognise', async () => {
    const promise = joinWaitlist({ input: { ...INPUT, email: 'alguem@mailinator.com' }, ipAddress: IP });

    await expectAppError(promise, AppErrorCode.INVALID_BODY);
    await expect(promise.catch((err: AppError) => err.message)).resolves.toBe(WAITLIST_DISPOSABLE_EMAIL_MESSAGE);
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it('answers ok to a repeated email without storing or emailing again', async () => {
    prisma.waitlistEntry.findUnique.mockResolvedValue({ id: 'entry_0' });

    const result = await joinWaitlist({ input: { ...INPUT, email: '  Ana@Exemplo.com ' }, ipAddress: IP });

    expect(result).toEqual({ ok: true });
    expect(prisma.waitlistEntry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ana@exemplo.com' } }),
    );
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
    expect(jobsClient.triggerJob).not.toHaveBeenCalled();
  });

  it('stores a new entry with the normalised phone and consent, then queues the emails', async () => {
    const result = await joinWaitlist({ input: INPUT, ipAddress: IP });

    expect(result).toEqual({ ok: true });

    expect(prisma.waitlistEntry.create).toHaveBeenCalledTimes(1);

    const { data } = prisma.waitlistEntry.create.mock.calls[0][0];

    expect(data).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      phone: '+5562999999999',
      locale: 'pt-BR',
      consentVersion: '2026-09-29',
    });
    expect(data.consentedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('ip');
    expect(data).not.toHaveProperty('ipAddress');

    expect(jobsClient.triggerJob).toHaveBeenCalledWith({
      name: 'send.waitlist.joined.emails',
      payload: { waitlistEntryId: 'entry_1' },
    });

    const createOrder = prisma.waitlistEntry.create.mock.invocationCallOrder[0];
    const jobOrder = jobsClient.triggerJob.mock.invocationCallOrder[0];

    expect(createOrder).toBeLessThan(jobOrder);
  });

  it('uses "unknown" as the rate limit key when the address is missing', async () => {
    await joinWaitlist({ input: INPUT, ipAddress: undefined });

    expect(waitlistJoinRateLimit.check).toHaveBeenCalledWith({ ip: 'unknown' });
  });
});
