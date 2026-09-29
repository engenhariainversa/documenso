import { z } from 'zod';

export const ZCloudSubscriptionStateSchema = z.enum(['DISABLED', 'NONE', 'ACTIVE', 'GRACE', 'EXPIRED']);

export const ZCloudCheckoutChargeSchema = z.object({
  id: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  paymentUrl: z.string().nullable(),
  pixCopyPaste: z.string().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});

export const ZGetSubscriptionRequestSchema = z.object({
  organisationId: z.string().describe('The ID of the organisation.'),
});

export const ZGetSubscriptionResponseSchema = z.object({
  isBillingEnabled: z.boolean(),
  isProviderConfigured: z.boolean(),
  state: ZCloudSubscriptionStateSchema,
  isSendingAllowed: z.boolean(),
  priceCents: z.number(),
  currency: z.string(),
  currentPeriodStart: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  pendingCharge: ZCloudCheckoutChargeSchema.nullable(),
});

export type TGetSubscriptionRequest = z.infer<typeof ZGetSubscriptionRequestSchema>;
export type TGetSubscriptionResponse = z.infer<typeof ZGetSubscriptionResponseSchema>;
