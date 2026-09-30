import { describe, expect, it } from 'vitest';

import { normalizeWaitlistPhone } from './normalize-phone';

describe('normalizeWaitlistPhone', () => {
  it('joins the three parts into E.164', () => {
    expect(normalizeWaitlistPhone({ country: '55', area: '62', number: '999999999' })).toBe('+5562999999999');
  });

  it('drops leading zeros of the country code and separators in every part', () => {
    expect(normalizeWaitlistPhone({ country: '055', area: '(62)', number: '99999-9999' })).toBe('+5562999999999');
  });

  it('refuses a part without digits', () => {
    expect(() => normalizeWaitlistPhone({ country: '', area: '62', number: '999999999' })).toThrow();
    expect(() => normalizeWaitlistPhone({ country: '00', area: '62', number: '999999999' })).toThrow();
  });
});
