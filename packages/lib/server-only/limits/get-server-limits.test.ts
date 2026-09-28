import { describe, expect, it } from 'vitest';

import { DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT, DEFAULT_RECIPIENT_COUNT } from '../../constants/limits';
import { buildLimitsResponse } from './get-server-limits';

describe('buildLimitsResponse', () => {
  it('returns unlimited quota and remaining', () => {
    const result = buildLimitsResponse({ envelopeItemCount: 10, recipientCount: 0 });

    expect(result.quota.documents).toBe(Infinity);
    expect(result.remaining.documents).toBe(Infinity);
    expect(result.remaining.recipients).toBe(Infinity);
    expect(result.remaining.directTemplates).toBe(Infinity);
  });

  it('uses the organisation claim counts', () => {
    const result = buildLimitsResponse({ envelopeItemCount: 10, recipientCount: 0 });

    expect(result.maximumEnvelopeItemCount).toBe(10);
    expect(result.maximumRecipientCount).toBe(0);
  });

  it('falls back to defaults without a claim', () => {
    const result = buildLimitsResponse(null);

    expect(result.maximumEnvelopeItemCount).toBe(DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT);
    expect(result.maximumRecipientCount).toBe(DEFAULT_RECIPIENT_COUNT);
  });
});
