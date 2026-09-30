import { deleteWaitlistEntry } from '@documenso/lib/server-only/waitlist/delete-waitlist-entry';

import { adminProcedure } from '../../trpc';
import { ZDeleteWaitlistEntryRequestSchema, ZDeleteWaitlistEntryResponseSchema } from './delete-waitlist-entry.types';

export const deleteWaitlistEntryRoute = adminProcedure
  .input(ZDeleteWaitlistEntryRequestSchema)
  .output(ZDeleteWaitlistEntryResponseSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger.info({ input: { id: input.id } });

    await deleteWaitlistEntry({ id: input.id });
  });
