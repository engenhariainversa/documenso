import { describe, expect, it } from 'vitest';

import { WAITLIST_LOCALES, ZJoinWaitlistRequestSchema } from './waitlist';

const VALID = {
  name: 'Ana Souza',
  email: 'Ana@Exemplo.com',
  phoneCountry: '+55',
  phoneArea: '(62)',
  phoneNumber: '99999-9999',
  locale: 'pt-BR',
  consent: true,
  consentVersion: '2026-09-29',
};

describe('ZJoinWaitlistRequestSchema', () => {
  it('accepts a valid payload, lowercases the email and keeps only digits in the phone parts', () => {
    const result = ZJoinWaitlistRequestSchema.parse(VALID);

    expect(result.email).toBe('ana@exemplo.com');
    expect(result.phoneCountry).toBe('55');
    expect(result.phoneArea).toBe('62');
    expect(result.phoneNumber).toBe('999999999');
  });

  it('requires the consent box to be ticked', () => {
    expect(ZJoinWaitlistRequestSchema.safeParse({ ...VALID, consent: false }).success).toBe(false);
  });

  it('only accepts the landing languages', () => {
    expect(WAITLIST_LOCALES).toEqual(['pt-BR', 'en']);
    expect(ZJoinWaitlistRequestSchema.safeParse({ ...VALID, locale: 'es' }).success).toBe(false);
  });

  it('refuses a local number shorter than 6 digits', () => {
    expect(ZJoinWaitlistRequestSchema.safeParse({ ...VALID, phoneNumber: '12345' }).success).toBe(false);
  });

  it('refuses a country code made only of zeros and a phone longer than E.164 allows', () => {
    expect(ZJoinWaitlistRequestSchema.safeParse({ ...VALID, phoneCountry: '00' }).success).toBe(false);
    expect(
      ZJoinWaitlistRequestSchema.safeParse({
        ...VALID,
        phoneCountry: '5555',
        phoneArea: '62626',
        phoneNumber: '999999999999',
      }).success,
    ).toBe(false);
  });

  it('refuses an invalid email', () => {
    expect(ZJoinWaitlistRequestSchema.safeParse({ ...VALID, email: 'nao-e-email' }).success).toBe(false);
  });

  it('lets the honeypot and the captcha token be absent', () => {
    const result = ZJoinWaitlistRequestSchema.parse(VALID);

    expect(result.website).toBeUndefined();
    expect(result.captchaToken).toBeUndefined();
  });
});
