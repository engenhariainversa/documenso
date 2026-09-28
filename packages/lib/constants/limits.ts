export type TLimits = {
  documents: number;
  recipients: number;
  directTemplates: number;
};

export const UNLIMITED_LIMITS: TLimits = {
  documents: Infinity,
  recipients: Infinity,
  directTemplates: Infinity,
};

/**
 * Initial value for the frontend before values are loaded from the server.
 */
export const DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT = 5;

/**
 * Initial value for the frontend. 0 = unlimited recipients.
 */
export const DEFAULT_RECIPIENT_COUNT = 20;
