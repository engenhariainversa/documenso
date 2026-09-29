import { prisma } from '@documenso/prisma';

import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '../../constants/organisations';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { buildOrganisationWhereQuery } from '../../utils/organisations';

export type AssertUserCanManageOrganisationBillingOptions = {
  organisationId: string;
  userId: number;
};

/**
 * Throws unless the user can manage the billing of the organisation.
 *
 * Answers "not found" instead of "forbidden", so that someone without access cannot
 * tell whether the organisation exists.
 */
export const assertUserCanManageOrganisationBilling = async ({
  organisationId,
  userId,
}: AssertUserCanManageOrganisationBillingOptions) => {
  const organisation = await prisma.organisation.findFirst({
    where: buildOrganisationWhereQuery({
      organisationId,
      userId,
      roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_BILLING'],
    }),
    select: {
      id: true,
    },
  });

  if (!organisation) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Organisation not found',
    });
  }
};
