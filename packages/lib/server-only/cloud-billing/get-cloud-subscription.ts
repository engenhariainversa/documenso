import { prisma } from '@documenso/prisma';
import { CloudSubscriptionChargeStatus } from '@prisma/client';

import {
  CLOUD_SUBSCRIPTION_CURRENCY,
  CLOUD_SUBSCRIPTION_PRICE_CENTS,
  IS_CLOUD_BILLING_ENABLED,
  IS_CLOUD_BILLING_PROVIDER_CONFIGURED,
} from '../../constants/cloud-billing';
import {
  getCloudSubscriptionState,
  isSendingAllowedForState,
  type TCloudSubscriptionState,
} from '../../universal/cloud-billing/subscription-state';
import {
  CHARGE_COUPON_INCLUDE,
  getCheckoutReuseCutoff,
  mapChargeToCheckout,
  type TCloudCheckoutCharge,
} from './create-checkout';

export type TCloudSubscription = {
  isBillingEnabled: boolean;
  isProviderConfigured: boolean;
  state: TCloudSubscriptionState;
  isSendingAllowed: boolean;
  priceCents: number;
  currency: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  pendingCharge: TCloudCheckoutCharge | null;
};

export type GetCloudSubscriptionOptions = {
  organisationId: string;
  now?: Date;
};

/**
 * The cloud subscription of an organisation, as shown on its plan page.
 *
 * The caller is responsible for checking that the user may manage billing.
 */
export const getCloudSubscription = async ({
  organisationId,
  now = new Date(),
}: GetCloudSubscriptionOptions): Promise<TCloudSubscription> => {
  const isBillingEnabled = IS_CLOUD_BILLING_ENABLED();

  if (!isBillingEnabled) {
    return {
      isBillingEnabled,
      isProviderConfigured: false,
      state: 'DISABLED',
      isSendingAllowed: true,
      priceCents: CLOUD_SUBSCRIPTION_PRICE_CENTS,
      currency: CLOUD_SUBSCRIPTION_CURRENCY,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      pendingCharge: null,
    };
  }

  const [subscription, pendingCharge] = await Promise.all([
    prisma.cloudSubscription.findUnique({
      where: {
        organisationId,
      },
    }),
    prisma.cloudSubscriptionCharge.findFirst({
      where: {
        organisationId,
        status: CloudSubscriptionChargeStatus.PENDING,
        providerChargeId: {
          not: null,
        },
        createdAt: {
          gt: getCheckoutReuseCutoff(now),
        },
        OR: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              gt: now,
            },
          },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: CHARGE_COUPON_INCLUDE,
    }),
  ]);

  const state = getCloudSubscriptionState({
    isBillingEnabled,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    now,
  });

  return {
    isBillingEnabled,
    isProviderConfigured: IS_CLOUD_BILLING_PROVIDER_CONFIGURED(),
    state,
    isSendingAllowed: isSendingAllowedForState(state),
    priceCents: CLOUD_SUBSCRIPTION_PRICE_CENTS,
    currency: CLOUD_SUBSCRIPTION_CURRENCY,
    currentPeriodStart: subscription?.currentPeriodStart ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    pendingCharge: pendingCharge ? mapChargeToCheckout(pendingCharge) : null,
  };
};
