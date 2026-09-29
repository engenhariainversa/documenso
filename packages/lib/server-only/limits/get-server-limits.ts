import { prisma } from '@documenso/prisma';

import { IS_CLOUD_BILLING_ENABLED } from '../../constants/cloud-billing';
import {
  DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
  DEFAULT_RECIPIENT_COUNT,
  type TLimits,
  UNLIMITED_LIMITS,
} from '../../constants/limits';
import {
  getCloudSubscriptionState,
  isSendingAllowedForState,
  type TCloudSubscriptionState,
} from '../../universal/cloud-billing/subscription-state';

/**
 * The Docverse Cloud subscription of the organisation, as far as limits care.
 *
 * It never lowers the quotas: an organisation without a subscription can still
 * create and edit documents, it only cannot send them.
 */
export type TLimitsSubscription = {
  state: TCloudSubscriptionState;
  isSendingAllowed: boolean;
};

export const DEFAULT_LIMITS_SUBSCRIPTION: TLimitsSubscription = {
  state: 'DISABLED',
  isSendingAllowed: true,
};

export type TLimitsResponse = {
  quota: TLimits;
  remaining: TLimits;
  maximumEnvelopeItemCount: number;
  maximumRecipientCount: number;
  subscription: TLimitsSubscription;
};

export type GetServerLimitsOptions = {
  userId: number;
  teamId: number;
  now?: Date;
};

export const buildLimitsResponse = (
  claim: { envelopeItemCount: number; recipientCount: number } | null,
  subscription: TLimitsSubscription = DEFAULT_LIMITS_SUBSCRIPTION,
): TLimitsResponse => {
  return {
    quota: UNLIMITED_LIMITS,
    remaining: UNLIMITED_LIMITS,
    maximumEnvelopeItemCount: claim?.envelopeItemCount ?? DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
    maximumRecipientCount: claim?.recipientCount ?? DEFAULT_RECIPIENT_COUNT,
    subscription,
  };
};

/**
 * Document quotas are always unlimited. Only the per-organisation envelope item and
 * recipient caps from the claim apply, plus the Docverse Cloud subscription, which
 * decides whether documents can be sent.
 */
export const getServerLimits = async ({
  userId,
  teamId,
  now = new Date(),
}: GetServerLimitsOptions): Promise<TLimitsResponse> => {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      teamGroups: {
        some: {
          organisationGroup: {
            organisationGroupMembers: {
              some: {
                organisationMember: {
                  userId,
                },
              },
            },
          },
        },
      },
    },
    select: {
      organisation: {
        select: {
          organisationClaim: {
            select: {
              envelopeItemCount: true,
              recipientCount: true,
            },
          },
          cloudSubscription: {
            select: {
              currentPeriodEnd: true,
            },
          },
        },
      },
    },
  });

  const state = getCloudSubscriptionState({
    isBillingEnabled: IS_CLOUD_BILLING_ENABLED(),
    currentPeriodEnd: team?.organisation.cloudSubscription?.currentPeriodEnd,
    now,
  });

  return buildLimitsResponse(team?.organisation.organisationClaim ?? null, {
    state,
    isSendingAllowed: isSendingAllowedForState(state),
  });
};
