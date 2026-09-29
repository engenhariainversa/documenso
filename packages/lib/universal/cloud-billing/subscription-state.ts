import { DateTime } from 'luxon';

import { CLOUD_SUBSCRIPTION_GRACE_PERIOD_DAYS } from '../../constants/cloud-billing';

/**
 * - DISABLED: billing is off for this instance (self-hosted).
 * - NONE: billing is on and the organisation never paid.
 * - ACTIVE: inside the paid period.
 * - GRACE: the paid period ended less than the grace period ago.
 * - EXPIRED: the paid period and the grace period are both over.
 */
export type TCloudSubscriptionState = 'DISABLED' | 'NONE' | 'ACTIVE' | 'GRACE' | 'EXPIRED';

export type GetCloudSubscriptionStateOptions = {
  isBillingEnabled: boolean;
  currentPeriodEnd: Date | null | undefined;
  now?: Date;
};

/**
 * Derive the subscription state from the end of the paid period.
 *
 * The state is never stored: deriving it on read means it cannot drift away from
 * the dates, and no scheduled job is needed to expire subscriptions.
 */
export const getCloudSubscriptionState = ({
  isBillingEnabled,
  currentPeriodEnd,
  now = new Date(),
}: GetCloudSubscriptionStateOptions): TCloudSubscriptionState => {
  if (!isBillingEnabled) {
    return 'DISABLED';
  }

  if (!currentPeriodEnd || Number.isNaN(currentPeriodEnd.getTime())) {
    return 'NONE';
  }

  if (now < currentPeriodEnd) {
    return 'ACTIVE';
  }

  const graceEnd = DateTime.fromJSDate(currentPeriodEnd, { zone: 'utc' })
    .plus({ days: CLOUD_SUBSCRIPTION_GRACE_PERIOD_DAYS })
    .toJSDate();

  if (now < graceEnd) {
    return 'GRACE';
  }

  return 'EXPIRED';
};

export const isSendingAllowedForState = (state: TCloudSubscriptionState) => {
  return state === 'DISABLED' || state === 'ACTIVE' || state === 'GRACE';
};

export type ComputeNextPeriodOptions = {
  now: Date;
  currentPeriodEnd: Date | null | undefined;
};

/**
 * The period a new payment buys.
 *
 * Paying before the current period ends extends it from its end, so paying early
 * never loses days. Otherwise the new period starts at the moment of payment.
 */
export const computeNextPeriod = ({ now, currentPeriodEnd }: ComputeNextPeriodOptions) => {
  const isCurrentPeriodRunning =
    currentPeriodEnd !== null &&
    currentPeriodEnd !== undefined &&
    !Number.isNaN(currentPeriodEnd.getTime()) &&
    currentPeriodEnd > now;

  const periodStart = isCurrentPeriodRunning ? currentPeriodEnd : now;

  const periodEnd = DateTime.fromJSDate(periodStart, { zone: 'utc' }).plus({ months: 1 }).toJSDate();

  return {
    periodStart: new Date(periodStart.getTime()),
    periodEnd,
  };
};
