import { updateCloudBillingCoupon } from '@documenso/lib/server-only/cloud-billing/coupons/manage-coupons';

import { adminProcedure } from '../../trpc';
import {
  ZUpdateCloudBillingCouponRequestSchema,
  ZUpdateCloudBillingCouponResponseSchema,
} from './cloud-billing-coupon.types';

export const updateCloudBillingCouponRoute = adminProcedure
  .input(ZUpdateCloudBillingCouponRequestSchema)
  .output(ZUpdateCloudBillingCouponResponseSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger.info({ input: { id: input.id, isActive: input.isActive } });

    await updateCloudBillingCoupon(input);
  });
