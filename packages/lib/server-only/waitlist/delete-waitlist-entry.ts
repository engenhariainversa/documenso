import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';

export type DeleteWaitlistEntryOptions = {
  id: string;
};

/**
 * Removes an entry from the waitlist. This is how a removal request (LGPD) is fulfilled.
 */
export const deleteWaitlistEntry = async ({ id }: DeleteWaitlistEntryOptions) => {
  const { count } = await prisma.waitlistEntry.deleteMany({ where: { id } });

  if (count === 0) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Waitlist entry not found',
    });
  }
};
