type TSubscriptionSnapshot = {
  currentPeriodEnd: Date | null;
  pendingCharge: { id: string } | null;
};

export type IsPaymentConfirmedOptions = {
  /**
   * The subscription when the user said they had paid.
   */
  before: TSubscriptionSnapshot;

  /**
   * The subscription read again after that.
   */
  after: TSubscriptionSnapshot;
};

/**
 * Whether the payment the user was waiting for has been confirmed.
 *
 * The state of the plan is not enough: an organisation renewing early is already
 * active, paid or not. A payment is confirmed when the paid period moved forward.
 */
export const isPaymentConfirmed = ({ before, after }: IsPaymentConfirmedOptions) => {
  if (!before.pendingCharge || !after.currentPeriodEnd) {
    return false;
  }

  if (!before.currentPeriodEnd) {
    return true;
  }

  return after.currentPeriodEnd.getTime() > before.currentPeriodEnd.getTime();
};
