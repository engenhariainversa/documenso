import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLandingSignupAction, isWaitlistEnabled, WAITLIST_CONSENT_VERSION } from './landing-waitlist';

describe('isWaitlistEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off by default', () => {
    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', '');

    expect(isWaitlistEnabled()).toBe(false);
  });

  it('is only on for the literal "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', 'true');
    expect(isWaitlistEnabled()).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', 'TRUE');
    expect(isWaitlistEnabled()).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', '1');
    expect(isWaitlistEnabled()).toBe(false);
  });
});

describe('getLandingSignupAction', () => {
  it('keeps the signup button when signup is open, whatever the waitlist flag', () => {
    expect(getLandingSignupAction({ isSignupEnabled: true, isWaitlistEnabled: false })).toBe('signup');
    expect(getLandingSignupAction({ isSignupEnabled: true, isWaitlistEnabled: true })).toBe('signup');
  });

  it('points to the waitlist when signup is closed and the waitlist is on', () => {
    expect(getLandingSignupAction({ isSignupEnabled: false, isWaitlistEnabled: true })).toBe('waitlist');
  });

  it('shows nothing when signup is closed and the waitlist is off', () => {
    expect(getLandingSignupAction({ isSignupEnabled: false, isWaitlistEnabled: false })).toBe('none');
  });
});

describe('WAITLIST_CONSENT_VERSION', () => {
  it('is a date', () => {
    expect(WAITLIST_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
