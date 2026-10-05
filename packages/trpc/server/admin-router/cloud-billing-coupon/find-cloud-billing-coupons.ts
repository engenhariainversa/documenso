import { CLOUD_SUBSCRIPTION_PRICE_CENTS } from '@documenso/lib/constants/cloud-billing';
import { findCloudBillingCoupons } from '@documenso/lib/server-only/cloud-billing/coupons/manage-coupons';

import { adminProcedure } from '../../trpc';
import {
  ZFindCloudBillingCouponsRequestSchema,
  ZFindCloudBillingCouponsResponseSchema,
} from './cloud-billing-coupon.types';

export const findCloudBillingCouponsRoute = adminProcedure
  .input(ZFindCloudBillingCouponsRequestSchema)
  .output(ZFindCloudBillingCouponsResponseSchema)
  .query(async () => {
    return {
      coupons: await findCloudBillingCoupons(),
      priceCents: CLOUD_SUBSCRIPTION_PRICE_CENTS,
    };
  });
