import { joinWaitlist } from '@documenso/lib/server-only/waitlist/join-waitlist';

import { procedure } from '../trpc';
import { ZJoinWaitlistRequestSchema, ZJoinWaitlistResponseSchema } from './join-waitlist.types';

/**
 * NOTE: THIS IS A PUBLIC (UNAUTHENTICATED) PROCEDURE.
 * Visitors of the landing page join the waitlist before having an account, so no
 * session or API token is required. The rules (feature flag, rate limit, honeypot,
 * captcha, disposable emails, duplicates) live in `joinWaitlist`.
 */
export const joinWaitlistRoute = procedure
  .input(ZJoinWaitlistRequestSchema)
  .output(ZJoinWaitlistResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { ipAddress } = ctx.metadata.requestMetadata;

    return await joinWaitlist({ input, ipAddress });
  });
