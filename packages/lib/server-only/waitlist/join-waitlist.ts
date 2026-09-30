import { prisma } from '@documenso/prisma';

import { isDisposableEmail } from '../../constants/auth';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { jobsClient } from '../../jobs/client';
import { type TJoinWaitlistRequest, WAITLIST_DISPOSABLE_EMAIL_MESSAGE } from '../../types/waitlist';
import { isWaitlistEnabled } from '../../utils/landing-waitlist';
import { verifyCaptchaToken } from '../captcha/verify-captcha';
import { waitlistJoinRateLimit } from '../rate-limit/rate-limits';
import { getEmailBlocklistDomains } from '../site-settings/get-email-blocklist-domains';
import { normalizeWaitlistPhone } from './normalize-phone';

export { WAITLIST_DISPOSABLE_EMAIL_MESSAGE };

export type JoinWaitlistOptions = {
  input: TJoinWaitlistRequest;
  ipAddress: string | null | undefined;
};

/**
 * Public sign-up to the waitlist.
 *
 * Every successful path answers the same `{ ok: true }`, so the response never tells
 * whether an address is already on the list. The IP is only used as the rate limit
 * key; it is never stored on the entry.
 */
export const joinWaitlist = async ({ input, ipAddress }: JoinWaitlistOptions) => {
  if (!isWaitlistEnabled()) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'The waitlist is not enabled',
      statusCode: 404,
    });
  }

  const rateLimit = await waitlistJoinRateLimit.check({ ip: ipAddress ?? 'unknown' });

  if (rateLimit.isLimited) {
    throw new AppError(AppErrorCode.TOO_MANY_REQUESTS, {
      message: 'Too many sign-ups from this address',
      statusCode: 429,
    });
  }

  // Honeypot: answer as if it worked and store nothing.
  if (input.website) {
    return { ok: true } as const;
  }

  await verifyCaptchaToken({ token: input.captchaToken, ipAddress });

  const email = input.email.trim().toLowerCase();

  // Same check as signup: the built-in disposable list plus the domains blocked in the site settings.
  if (isDisposableEmail(email, await getEmailBlocklistDomains())) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: WAITLIST_DISPOSABLE_EMAIL_MESSAGE,
      statusCode: 400,
    });
  }

  const existing = await prisma.waitlistEntry.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return { ok: true } as const;
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      name: input.name,
      email,
      phone: normalizeWaitlistPhone({
        country: input.phoneCountry,
        area: input.phoneArea,
        number: input.phoneNumber,
      }),
      locale: input.locale,
      consentVersion: input.consentVersion,
      consentedAt: new Date(),
    },
  });

  await jobsClient.triggerJob({
    name: 'send.waitlist.joined.emails',
    payload: { waitlistEntryId: entry.id },
  });

  return { ok: true } as const;
};
