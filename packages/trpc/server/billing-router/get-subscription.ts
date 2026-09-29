import { assertUserCanManageOrganisationBilling } from '@documenso/lib/server-only/cloud-billing/assert-user-can-manage-billing';
import { getCloudSubscription } from '@documenso/lib/server-only/cloud-billing/get-cloud-subscription';

import { authenticatedProcedure } from '../trpc';
import { ZGetSubscriptionRequestSchema, ZGetSubscriptionResponseSchema } from './get-subscription.types';

export const getSubscriptionRoute = authenticatedProcedure
  .input(ZGetSubscriptionRequestSchema)
  .output(ZGetSubscriptionResponseSchema)
  .query(async ({ input, ctx }) => {
    const { organisationId } = input;
    const userId = ctx.user.id;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    await assertUserCanManageOrganisationBilling({ organisationId, userId });

    return await getCloudSubscription({ organisationId });
  });
