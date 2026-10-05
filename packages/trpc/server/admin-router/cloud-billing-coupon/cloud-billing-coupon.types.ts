import { z } from 'zod';

const ZCouponDiscountTypeSchema = z.enum(['PERCENT', 'AMOUNT_OFF']);

export const ZAdminCloudBillingCouponSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  code: z.string(),
  description: z.string(),
  discountType: ZCouponDiscountTypeSchema,
  discountValue: z.number(),
  isActive: z.boolean(),
  validFrom: z.date().nullable(),
  validUntil: z.date().nullable(),
  maxRedemptions: z.number().nullable(),
  paidRedemptions: z.number(),
  pendingRedemptions: z.number(),
  finalAmountCents: z.number(),
});

export type TAdminCloudBillingCoupon = z.infer<typeof ZAdminCloudBillingCouponSchema>;

export const ZFindCloudBillingCouponsRequestSchema = z.void();

export const ZFindCloudBillingCouponsResponseSchema = z.object({
  coupons: z.array(ZAdminCloudBillingCouponSchema),
  priceCents: z.number(),
});

export type TFindCloudBillingCouponsResponse = z.infer<typeof ZFindCloudBillingCouponsResponseSchema>;

export const ZCreateCloudBillingCouponRequestSchema = z.object({
  code: z.string().trim().min(3).max(32),
  description: z.string().max(200).default(''),
  discountType: ZCouponDiscountTypeSchema,
  discountValue: z.number().int().min(1),
  validFrom: z.date().nullable().default(null),
  validUntil: z.date().nullable().default(null),
  maxRedemptions: z.number().int().min(1).nullable().default(null),
});

export type TCreateCloudBillingCouponRequest = z.infer<typeof ZCreateCloudBillingCouponRequestSchema>;

export const ZCreateCloudBillingCouponResponseSchema = z.object({
  id: z.string(),
});

export const ZUpdateCloudBillingCouponRequestSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
  validFrom: z.date().nullable().optional(),
  validUntil: z.date().nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
});

export type TUpdateCloudBillingCouponRequest = z.infer<typeof ZUpdateCloudBillingCouponRequestSchema>;

export const ZUpdateCloudBillingCouponResponseSchema = z.void();
