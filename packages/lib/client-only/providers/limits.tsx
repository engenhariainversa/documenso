import { createContext, useContext } from 'react';

import { DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT, UNLIMITED_LIMITS } from '../../constants/limits';
import type { TLimitsResponse } from '../../server-only/limits/get-server-limits';

export type LimitsContextValue = TLimitsResponse & {
  isLoading: boolean;
  refreshLimits: () => Promise<void>;
};

const LimitsContext = createContext<LimitsContextValue | null>(null);

export type LimitsProviderProps = {
  initialValue?: Omit<TLimitsResponse, 'maximumRecipientCount'> & { maximumRecipientCount?: number };
  teamId: number;
  disableLimitsFetch?: boolean;
  children?: React.ReactNode;
};

/**
 * Limits are static in Docverse (no plans), so there is nothing to fetch:
 * the provider only exposes the value computed by the parent layout.
 *
 * `initialValue` may be undefined while the parent layout has not yet resolved
 * the current organisation (e.g. on first render); default to unlimited in that case.
 */
export const LimitsProvider = ({ initialValue, children }: LimitsProviderProps) => {
  const value: LimitsContextValue = {
    quota: initialValue?.quota ?? UNLIMITED_LIMITS,
    remaining: initialValue?.remaining ?? UNLIMITED_LIMITS,
    maximumEnvelopeItemCount: initialValue?.maximumEnvelopeItemCount ?? DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
    maximumRecipientCount: initialValue?.maximumRecipientCount ?? 0,
    isLoading: false,
    refreshLimits: async () => {},
  };

  return <LimitsContext.Provider value={value}>{children}</LimitsContext.Provider>;
};

export const useLimits = () => {
  const limits = useContext(LimitsContext);

  if (!limits) {
    throw new Error('useLimits must be used within a LimitsProvider');
  }

  return limits;
};
