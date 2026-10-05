import { createCloudBillingCoupon } from '@documenso/lib/server-only/cloud-billing/coupons/manage-coupons';

import { adminProcedure } from '../../trpc';
import {
  ZCreateCloudBillingCouponRequestSchema,
  ZCreateCloudBillingCouponResponseSchema,
} from './cloud-billing-coupon.types';

export const createCloudBillingCouponRoute = adminProcedure
  .input(ZCreateCloudBillingCouponRequestSchema)
  .output(ZCreateCloudBillingCouponResponseSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger.info({
      input: { code: input.code, discountType: input.discountType, discountValue: input.discountValue },
    });

    const coupon = await createCloudBillingCoupon({ ...input, createdByUserId: ctx.user.id });

    return { id: coupon.id };
  });
