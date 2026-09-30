import { prisma } from '@documenso/prisma';

import { jobsClient } from '../../jobs/client';
import { onCreateUserHook } from '../user/create-user';

export type InviteWaitlistEntriesOptions = {
  ids: string[];
};

export type InviteWaitlistEntryResult =
  | { id: string; status: 'INVITED'; userId: number }
  | { id: string; status: 'EXISTING'; userId: number }
  | { id: string; status: 'NOT_FOUND' }
  | { id: string; status: 'FAILED'; error: string };

/**
 * Invites waitlist entries from the admin.
 *
 * For each entry, an account is created without a password and with a verified email
 * (the person sets the password from the invite link), plus the personal organisation
 * every self-signed-up user gets. When the email already has an account, only the
 * invite stamp is written and no email is sent.
 *
 * Entries are processed one at a time; a failure is reported on its entry and never
 * stops the others.
 */
export const inviteWaitlistEntries = async ({ ids }: InviteWaitlistEntriesOptions) => {
  const entries = await prisma.waitlistEntry.findMany({
    where: { id: { in: ids } },
  });

  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

  const results: InviteWaitlistEntryResult[] = [];

  for (const id of ids) {
    const entry = entriesById.get(id);

    if (!entry) {
      results.push({ id, status: 'NOT_FOUND' });
      continue;
    }

    try {
      const existingUser = await prisma.user.findFirst({
        where: { email: entry.email },
        select: { id: true },
      });

      if (existingUser) {
        await stampInvite({ id, userId: existingUser.id });

        results.push({ id, status: 'EXISTING', userId: existingUser.id });
        continue;
      }

      const user = await prisma.user.create({
        data: {
          name: entry.name,
          email: entry.email,
          password: null,
          // The person proves ownership of the address by opening the invite link, and the
          // address was typed by them on the form; same reasoning as the admin-created user.
          emailVerified: new Date(),
        },
      });

      await onCreateUserHook(user);

      await stampInvite({ id, userId: user.id });

      await jobsClient.triggerJob({
        name: 'send.waitlist.invite.email',
        payload: { waitlistEntryId: id, userId: user.id },
      });

      results.push({ id, status: 'INVITED', userId: user.id });
    } catch (err) {
      results.push({ id, status: 'FAILED', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { results };
};

const stampInvite = async ({ id, userId }: { id: string; userId: number }) => {
  await prisma.waitlistEntry.update({
    where: { id },
    data: { invitedAt: new Date(), invitedUserId: userId },
  });
};
