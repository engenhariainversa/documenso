import { z } from 'zod';

export const ZInviteWaitlistEntriesRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export type TInviteWaitlistEntriesRequest = z.infer<typeof ZInviteWaitlistEntriesRequestSchema>;

export const ZInviteWaitlistEntryResultSchema = z.discriminatedUnion('status', [
  z.object({ id: z.string(), status: z.literal('INVITED'), userId: z.number() }),
  z.object({ id: z.string(), status: z.literal('RESENT'), userId: z.number() }),
  z.object({ id: z.string(), status: z.literal('EXISTING'), userId: z.number() }),
  z.object({ id: z.string(), status: z.literal('NOT_FOUND') }),
  z.object({ id: z.string(), status: z.literal('FAILED'), error: z.string() }),
]);

export const ZInviteWaitlistEntriesResponseSchema = z.object({
  results: z.array(ZInviteWaitlistEntryResultSchema),
});

export type TInviteWaitlistEntriesResponse = z.infer<typeof ZInviteWaitlistEntriesResponseSchema>;
