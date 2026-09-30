import { z } from 'zod';

export const ZDeleteWaitlistEntryRequestSchema = z.object({
  id: z.string().min(1),
});

export type TDeleteWaitlistEntryRequest = z.infer<typeof ZDeleteWaitlistEntryRequestSchema>;

export const ZDeleteWaitlistEntryResponseSchema = z.void();
