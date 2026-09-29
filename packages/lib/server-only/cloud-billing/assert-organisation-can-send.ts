import { prisma } from '@documenso/prisma';

import { IS_CLOUD_BILLING_ENABLED } from '../../constants/cloud-billing';
import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  getCloudSubscriptionState,
  isSendingAllowedForState,
  type TCloudSubscriptionState,
} from '../../universal/cloud-billing/subscription-state';

export const SUBSCRIPTION_REQUIRED_ERROR_CODE = 'SUBSCRIPTION_REQUIRED';

/**
 * Throws when the subscription state does not allow sending documents.
 */
export const assertSendingAllowed = (state: TCloudSubscriptionState) => {
  if (isSendingAllowedForState(state)) {
    return;
  }

  throw new AppError(SUBSCRIPTION_REQUIRED_ERROR_CODE, {
    message: 'An active subscription is required to send documents',
    statusCode: 402,
  });
};

export type AssertOrganisationCanSendDocumentsOptions = {
  teamId: number;
  now?: Date;
};

/**
 * Refuse to send documents on behalf of a Docverse Cloud organisation without an
 * active subscription.
 *
 * Creating and editing drafts is never blocked, only sending is. With cloud billing
 * disabled (self-hosted) this returns without touching the database.
 */
export const assertOrganisationCanSendDocuments = async ({
  teamId,
  now = new Date(),
}: AssertOrganisationCanSendDocumentsOptions) => {
  const isBillingEnabled = IS_CLOUD_BILLING_ENABLED();

  if (!isBillingEnabled) {
    return;
  }

  const team = await prisma.team.findUnique({
    where: {
      id: teamId,
    },
    select: {
      organisation: {
        select: {
          cloudSubscription: {
            select: {
              currentPeriodEnd: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Team not found',
    });
  }

  const state = getCloudSubscriptionState({
    isBillingEnabled,
    currentPeriodEnd: team.organisation.cloudSubscription?.currentPeriodEnd,
    now,
  });

  assertSendingAllowed(state);
};
