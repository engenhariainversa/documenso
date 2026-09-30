import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_ID = 'send.waitlist.invite.email';

const SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_SCHEMA = z.object({
  waitlistEntryId: z.string(),
  userId: z.number(),
});

export type TSendWaitlistInviteEmailJobDefinition = z.infer<typeof SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_SCHEMA>;

export const SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION = {
  id: SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_ID,
  name: 'Send Waitlist Invite Email',
  version: '1.0.0',
  trigger: {
    name: SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_ID,
    schema: SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./send-waitlist-invite-email.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof SEND_WAITLIST_INVITE_EMAIL_JOB_DEFINITION_ID,
  TSendWaitlistInviteEmailJobDefinition
>;
