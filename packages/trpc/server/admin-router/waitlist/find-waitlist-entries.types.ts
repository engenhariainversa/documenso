import { z } from 'zod';

export const ZFindWaitlistEntriesRequestSchema = z.object({
  query: z.string().max(200).default(''),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

export type TFindWaitlistEntriesRequest = z.infer<typeof ZFindWaitlistEntriesRequestSchema>;

export const ZAdminWaitlistEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  locale: z.string(),
  source: z.string(),
  consentVersion: z.string(),
  consentedAt: z.date(),
  createdAt: z.date(),
  invitedAt: z.date().nullable(),
  invitedUserId: z.number().nullable(),
  hasAccount: z.boolean(),
});

export type TAdminWaitlistEntry = z.infer<typeof ZAdminWaitlistEntrySchema>;

export const ZFindWaitlistEntriesResponseSchema = z.object({
  entries: z.array(ZAdminWaitlistEntrySchema),
  count: z.number(),
  totalPages: z.number(),
});

export type TFindWaitlistEntriesResponse = z.infer<typeof ZFindWaitlistEntriesResponseSchema>;
