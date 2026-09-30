import { z } from 'zod';

export const ZExportWaitlistEntriesRequestSchema = z.void();

export const ZExportWaitlistEntriesResponseSchema = z.object({
  csv: z.string(),
  filename: z.string(),
});

export type TExportWaitlistEntriesResponse = z.infer<typeof ZExportWaitlistEntriesResponseSchema>;
