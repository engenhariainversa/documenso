import { prisma } from '@documenso/prisma';

import { IS_CLOUD_BILLING_ENABLED } from '../../constants/cloud-billing';
import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  getCloudSubscriptionState,
  isSendingAllowedForState,
  type TCloudSubscriptionState,
} from '../../universal/cloud-billing/subscription-state';

export const SUBSCRIPTION_REQUIRED_ERROR_CODE = AppErrorCode.SUBSCRIPTION_REQUIRED;

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

export type OrganisationSendingOptions = {
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
export const assertOrganisationCanSendDocuments = async ({ teamId, now = new Date() }: OrganisationSendingOptions) => {
  if (!IS_CLOUD_BILLING_ENABLED()) {
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
    isBillingEnabled: true,
    currentPeriodEnd: team.organisation.cloudSubscription?.currentPeriodEnd,
    now,
  });

  assertSendingAllowed(state);
};

/**
 * Same rule as `assertOrganisationCanSendDocuments`, for callers that skip the work
 * instead of failing, e.g. a background job.
 *
 * Errors other than the missing subscription are not hidden.
 */
export const isOrganisationSendingAllowed = async ({ teamId, now = new Date() }: OrganisationSendingOptions) => {
  return await assertOrganisationCanSendDocuments({ teamId, now })
    .then(() => true)
    .catch((err) => {
      const { code } = AppError.parseError(err);

      if (code === SUBSCRIPTION_REQUIRED_ERROR_CODE || code === AppErrorCode.NOT_FOUND) {
        return false;
      }

      throw err;
    });
};

export type IsDirectTemplateAvailableOptions = {
  /**
   * Token of the direct link of the template.
   */
  token: string;
  now?: Date;
};

/**
 * Whether a direct template can be used right now.
 *
 * Checked before the form is shown, so that the signer does not fill in a document
 * that would be refused when submitted. With cloud billing disabled (self-hosted)
 * this returns without touching the database.
 */
export const isDirectTemplateAvailable = async ({ token, now = new Date() }: IsDirectTemplateAvailableOptions) => {
  if (!IS_CLOUD_BILLING_ENABLED()) {
    return true;
  }

  const directLink = await prisma.templateDirectLink.findUnique({
    where: {
      token,
    },
    select: {
      envelope: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!directLink) {
    return false;
  }

  return await isOrganisationSendingAllowed({ teamId: directLink.envelope.teamId, now });
};
