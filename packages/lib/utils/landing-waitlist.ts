import { AppError, AppErrorCode } from '../errors/app-error';
import { WAITLIST_DISPOSABLE_EMAIL_MESSAGE } from '../types/waitlist';
import { env } from './env';

/**
 * Version of the consent text shown on the waitlist form. Bump it whenever the text
 * changes, so each entry records which wording the person agreed to.
 */
export const WAITLIST_CONSENT_VERSION = '2026-09-29';

/**
 * The waitlist is opt-in per instance and independent from the signup switches.
 */
export const isWaitlistEnabled = () => env('NEXT_PUBLIC_WAITLIST_ENABLED') === 'true';

export type LandingSignupAction = 'signup' | 'waitlist' | 'none';

/**
 * Which call to action the landing page shows in place of "Create account".
 */
export const getLandingSignupAction = ({
  isSignupEnabled,
  isWaitlistEnabled,
}: {
  isSignupEnabled: boolean;
  isWaitlistEnabled: boolean;
}): LandingSignupAction => {
  if (isSignupEnabled) {
    return 'signup';
  }

  return isWaitlistEnabled ? 'waitlist' : 'none';
};

export type WaitlistFormErrorKind = 'consent' | 'rateLimited' | 'disposableEmail' | 'generic';

/**
 * Which message the landing form shows for a failed sign-up.
 */
export const getWaitlistFormErrorKind = (error: unknown): WaitlistFormErrorKind => {
  const appError = AppError.parseError(error);

  if (appError.code === AppErrorCode.TOO_MANY_REQUESTS) {
    return 'rateLimited';
  }

  if (appError.message === WAITLIST_DISPOSABLE_EMAIL_MESSAGE) {
    return 'disposableEmail';
  }

  return 'generic';
};
