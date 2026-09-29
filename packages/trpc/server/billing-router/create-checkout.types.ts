import { z } from 'zod';

import { ZCloudCheckoutChargeSchema } from './get-subscription.types';

export const ZCreateCheckoutRequestSchema = z.object({
  organisationId: z.string().describe('The ID of the organisation.'),
  isReplacement: z.boolean().optional().describe('Give up on the pending payment request and create a new one.'),
});

export const ZCreateCheckoutResponseSchema = ZCloudCheckoutChargeSchema;

export type TCreateCheckoutRequest = z.infer<typeof ZCreateCheckoutRequestSchema>;
export type TCreateCheckoutResponse = z.infer<typeof ZCreateCheckoutResponseSchema>;
