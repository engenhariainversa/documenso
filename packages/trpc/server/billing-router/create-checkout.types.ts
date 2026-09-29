import { z } from 'zod';

import { ZCloudCheckoutChargeSchema } from './get-subscription.types';

export const ZCreateCheckoutRequestSchema = z.object({
  organisationId: z.string().describe('The ID of the organisation.'),
});

export const ZCreateCheckoutResponseSchema = ZCloudCheckoutChargeSchema;

export type TCreateCheckoutRequest = z.infer<typeof ZCreateCheckoutRequestSchema>;
export type TCreateCheckoutResponse = z.infer<typeof ZCreateCheckoutResponseSchema>;
