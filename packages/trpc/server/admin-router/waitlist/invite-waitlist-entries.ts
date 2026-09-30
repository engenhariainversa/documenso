import { inviteWaitlistEntries } from '@documenso/lib/server-only/waitlist/invite-waitlist-entries';

import { adminProcedure } from '../../trpc';
import {
  ZInviteWaitlistEntriesRequestSchema,
  ZInviteWaitlistEntriesResponseSchema,
} from './invite-waitlist-entries.types';

export const inviteWaitlistEntriesRoute = adminProcedure
  .input(ZInviteWaitlistEntriesRequestSchema)
  .output(ZInviteWaitlistEntriesResponseSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger.info({ input: { ids: input.ids } });

    return await inviteWaitlistEntries({ ids: input.ids });
  });
