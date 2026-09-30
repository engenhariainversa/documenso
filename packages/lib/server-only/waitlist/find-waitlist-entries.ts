import { prisma } from '@documenso/prisma';
import { Prisma } from '@prisma/client';

export type FindWaitlistEntriesOptions = {
  query?: string;
  page?: number;
  perPage?: number;
};

/**
 * Waitlist entries for the admin page, newest first, with a flag telling whether the
 * email already belongs to an account.
 */
export const findWaitlistEntries = async ({ query = '', page = 1, perPage = 20 }: FindWaitlistEntriesOptions) => {
  const whereClause = Prisma.validator<Prisma.WaitlistEntryWhereInput>()(
    query
      ? {
          OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }],
        }
      : {},
  );

  const [entries, count] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: Math.max(page - 1, 0) * perPage,
      take: perPage,
    }),
    prisma.waitlistEntry.count({ where: whereClause }),
  ]);

  // OAuth keeps the casing the provider returns, so the comparison ignores case.
  const users = entries.length
    ? await prisma.user.findMany({
        where: { email: { in: entries.map((entry) => entry.email), mode: 'insensitive' } },
        select: { email: true },
      })
    : [];

  const emailsWithAccount = new Set(users.map((user) => user.email.toLowerCase()));

  return {
    entries: entries.map((entry) => ({
      ...entry,
      hasAccount: emailsWithAccount.has(entry.email.toLowerCase()),
    })),
    count,
    totalPages: Math.ceil(count / perPage),
  };
};

/**
 * Every entry, for the CSV export.
 */
export const findAllWaitlistEntries = async () => {
  return await prisma.waitlistEntry.findMany({
    orderBy: { createdAt: 'desc' },
  });
};
