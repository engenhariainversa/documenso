import { findAllWaitlistEntries } from '@documenso/lib/server-only/waitlist/find-waitlist-entries';
import { waitlistEntriesToCsv } from '@documenso/lib/server-only/waitlist/waitlist-csv';

import { adminProcedure } from '../../trpc';
import {
  ZExportWaitlistEntriesRequestSchema,
  ZExportWaitlistEntriesResponseSchema,
} from './export-waitlist-entries.types';

export const exportWaitlistEntriesRoute = adminProcedure
  .input(ZExportWaitlistEntriesRequestSchema)
  .output(ZExportWaitlistEntriesResponseSchema)
  .query(async ({ ctx }) => {
    const entries = await findAllWaitlistEntries();

    ctx.logger.info({ exported: entries.length });

    const date = new Date().toISOString().slice(0, 10);

    return {
      csv: waitlistEntriesToCsv(entries),
      filename: `docverse-waitlist-${date}.csv`,
    };
  });
