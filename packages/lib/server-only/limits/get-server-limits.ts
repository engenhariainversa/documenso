import { prisma } from '@documenso/prisma';

import {
  DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
  DEFAULT_RECIPIENT_COUNT,
  type TLimits,
  UNLIMITED_LIMITS,
} from '../../constants/limits';

export type TLimitsResponse = {
  quota: TLimits;
  remaining: TLimits;
  maximumEnvelopeItemCount: number;
  maximumRecipientCount: number;
};

export type GetServerLimitsOptions = {
  userId: number;
  teamId: number;
};

export const buildLimitsResponse = (
  claim: { envelopeItemCount: number; recipientCount: number } | null,
): TLimitsResponse => {
  return {
    quota: UNLIMITED_LIMITS,
    remaining: UNLIMITED_LIMITS,
    maximumEnvelopeItemCount: claim?.envelopeItemCount ?? DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
    maximumRecipientCount: claim?.recipientCount ?? DEFAULT_RECIPIENT_COUNT,
  };
};

/**
 * Docverse has no plans: document quotas are always unlimited. Only the
 * per-organisation envelope item and recipient caps from the claim apply.
 */
export const getServerLimits = async ({ userId, teamId }: GetServerLimitsOptions): Promise<TLimitsResponse> => {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      teamGroups: {
        some: {
          organisationGroup: {
            organisationGroupMembers: {
              some: {
                organisationMember: {
                  userId,
                },
              },
            },
          },
        },
      },
    },
    select: {
      organisation: {
        select: {
          organisationClaim: {
            select: {
              envelopeItemCount: true,
              recipientCount: true,
            },
          },
        },
      },
    },
  });

  return buildLimitsResponse(team?.organisation.organisationClaim ?? null);
};
