import { assertUserCanManageOrganisationBilling } from '@documenso/lib/server-only/cloud-billing/assert-user-can-manage-billing';
import { createCloudSubscriptionCheckout } from '@documenso/lib/server-only/cloud-billing/create-checkout';

import { authenticatedProcedure } from '../trpc';
import { ZCreateCheckoutRequestSchema, ZCreateCheckoutResponseSchema } from './create-checkout.types';

export const createCheckoutRoute = authenticatedProcedure
  .input(ZCreateCheckoutRequestSchema)
  .output(ZCreateCheckoutResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { organisationId } = input;
    const userId = ctx.user.id;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    await assertUserCanManageOrganisationBilling({ organisationId, userId });

    return await createCloudSubscriptionCheckout({ organisationId, userId });
  });
