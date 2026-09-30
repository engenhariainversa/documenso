import { findWaitlistEntries } from '@documenso/lib/server-only/waitlist/find-waitlist-entries';

import { adminProcedure } from '../../trpc';
import { ZFindWaitlistEntriesRequestSchema, ZFindWaitlistEntriesResponseSchema } from './find-waitlist-entries.types';

export const findWaitlistEntriesRoute = adminProcedure
  .input(ZFindWaitlistEntriesRequestSchema)
  .output(ZFindWaitlistEntriesResponseSchema)
  .query(async ({ input }) => {
    return await findWaitlistEntries(input);
  });
