import { describe, expect, it } from 'vitest';

import { computeNextPeriod, getCloudSubscriptionState, isSendingAllowedForState } from './subscription-state';

const NOW = new Date('2026-10-15T12:00:00.000Z');

describe('getCloudSubscriptionState', () => {
  it('is DISABLED when billing is off, even with an expired period', () => {
    const state = getCloudSubscriptionState({
      isBillingEnabled: false,
      currentPeriodEnd: new Date('2020-01-01T00:00:00.000Z'),
      now: NOW,
    });

    expect(state).toBe('DISABLED');
  });

  it('is DISABLED when billing is off and there is no subscription', () => {
    expect(getCloudSubscriptionState({ isBillingEnabled: false, currentPeriodEnd: null, now: NOW })).toBe('DISABLED');
  });

  it.each([null, undefined])('is NONE without a period end (%j)', (currentPeriodEnd) => {
    expect(getCloudSubscriptionState({ isBillingEnabled: true, currentPeriodEnd, now: NOW })).toBe('NONE');
  });

  it('is ACTIVE while the period has not ended', () => {
    const state = getCloudSubscriptionState({
      isBillingEnabled: true,
      currentPeriodEnd: new Date('2026-10-16T12:00:00.000Z'),
      now: NOW,
    });

    expect(state).toBe('ACTIVE');
  });

  it('is ACTIVE one millisecond before the period ends', () => {
    const state = getCloudSubscriptionState({
      isBillingEnabled: true,
      currentPeriodEnd: new Date(NOW.getTime() + 1),
      now: NOW,
    });

    expect(state).toBe('ACTIVE');
  });

  it('enters GRACE at the exact moment the period ends', () => {
    expect(getCloudSubscriptionState({ isBillingEnabled: true, currentPeriodEnd: NOW, now: NOW })).toBe('GRACE');
  });

  it('is GRACE two days after the period ended', () => {
    const state = getCloudSubscriptionState({
      isBillingEnabled: true,
      currentPeriodEnd: new Date('2026-10-13T12:00:00.000Z'),
      now: NOW,
    });

    expect(state).toBe('GRACE');
  });

  it('is EXPIRED exactly three days after the period ended', () => {
    const state = getCloudSubscriptionState({
      isBillingEnabled: true,
      currentPeriodEnd: new Date('2026-10-12T12:00:00.000Z'),
      now: NOW,
    });

    expect(state).toBe('EXPIRED');
  });

  it('is NONE for an invalid date', () => {
    const state = getCloudSubscriptionState({
      isBillingEnabled: true,
      currentPeriodEnd: new Date('not a date'),
      now: NOW,
    });

    expect(state).toBe('NONE');
  });
});

describe('isSendingAllowedForState', () => {
  it.each(['DISABLED', 'ACTIVE', 'GRACE'] as const)('allows sending when %s', (state) => {
    expect(isSendingAllowedForState(state)).toBe(true);
  });

  it.each(['NONE', 'EXPIRED'] as const)('blocks sending when %s', (state) => {
    expect(isSendingAllowedForState(state)).toBe(false);
  });
});

describe('computeNextPeriod', () => {
  it('starts now when there is no current period', () => {
    const { periodStart, periodEnd } = computeNextPeriod({ now: NOW, currentPeriodEnd: null });

    expect(periodStart.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });

  it('extends from the current period end when paid early', () => {
    const { periodStart, periodEnd } = computeNextPeriod({
      now: NOW,
      currentPeriodEnd: new Date('2026-10-20T08:30:00.000Z'),
    });

    expect(periodStart.toISOString()).toBe('2026-10-20T08:30:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-11-20T08:30:00.000Z');
  });

  it('starts now when the current period already ended', () => {
    const { periodStart, periodEnd } = computeNextPeriod({
      now: NOW,
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(periodStart.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });

  it('clamps to the last day of a shorter month', () => {
    const { periodEnd } = computeNextPeriod({
      now: new Date('2027-01-31T10:00:00.000Z'),
      currentPeriodEnd: null,
    });

    expect(periodEnd.toISOString()).toBe('2027-02-28T10:00:00.000Z');
  });

  it('crosses the year boundary', () => {
    const { periodEnd } = computeNextPeriod({
      now: new Date('2026-12-15T10:00:00.000Z'),
      currentPeriodEnd: null,
    });

    expect(periodEnd.toISOString()).toBe('2027-01-15T10:00:00.000Z');
  });
});
