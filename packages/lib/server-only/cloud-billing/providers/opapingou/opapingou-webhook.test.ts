import { describe, expect, it } from 'vitest';

import {
  parseOpapingouWebhookNotification,
  signOpapingouWebhookBody,
  verifyOpapingouWebhookSignature,
} from './opapingou-webhook';

const SECRET = 'webhook-secret-for-tests';

// The provider has not decided the body of its webhooks; any JSON object will do here.
const PAYMENT_EVENT = {
  type: 'charge.paid',
  data: { id: 'c0ffee00-0000-4000-8000-000000000001', amountCents: 9990 },
};

const RAW_BODY = JSON.stringify(PAYMENT_EVENT);

describe('verifyOpapingouWebhookSignature', () => {
  const signature = signOpapingouWebhookBody({ rawBody: RAW_BODY, secret: SECRET });

  it('produces a hex SHA-256 signature', () => {
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts the correct signature', () => {
    expect(verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature, secret: SECRET })).toBe(true);
  });

  it('accepts the sha256= prefix', () => {
    expect(
      verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature: `sha256=${signature}`, secret: SECRET }),
    ).toBe(true);
  });

  it('accepts an uppercase signature', () => {
    expect(
      verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature: signature.toUpperCase(), secret: SECRET }),
    ).toBe(true);
  });

  it('accepts surrounding whitespace', () => {
    expect(verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature: ` ${signature} `, secret: SECRET })).toBe(
      true,
    );
  });

  it('rejects a body changed by one character', () => {
    const tampered = RAW_BODY.replace('9990', '9991');

    expect(verifyOpapingouWebhookSignature({ rawBody: tampered, signature, secret: SECRET })).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const other = signOpapingouWebhookBody({ rawBody: RAW_BODY, secret: 'another-secret' });

    expect(verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature: other, secret: SECRET })).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['too short', 'abcdef'],
    ['too long', `${'a'.repeat(64)}ff`],
    ['not hex', 'z'.repeat(64)],
    ['prefix only', 'sha256='],
  ])('rejects a %s signature without throwing', (_label, value) => {
    expect(verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature: value, secret: SECRET })).toBe(false);
  });

  it.each([undefined, null, ''])('always rejects when the secret is %j', (secret) => {
    const signedWithEmptySecret = signOpapingouWebhookBody({ rawBody: RAW_BODY, secret: '' });

    expect(verifyOpapingouWebhookSignature({ rawBody: RAW_BODY, signature: signedWithEmptySecret, secret })).toBe(
      false,
    );
  });

  it('verifies the exact bytes, not the parsed JSON', () => {
    const reformatted = JSON.stringify(PAYMENT_EVENT, null, 2);

    expect(verifyOpapingouWebhookSignature({ rawBody: reformatted, signature, secret: SECRET })).toBe(false);
  });
});

describe('parseOpapingouWebhookNotification', () => {
  it('identifies a delivery by the hash of its bytes', () => {
    const notification = parseOpapingouWebhookNotification(RAW_BODY);

    expect(notification).toEqual({
      eventId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      eventType: 'notification',
    });
    expect(parseOpapingouWebhookNotification(RAW_BODY)?.eventId).toBe(notification?.eventId);
    expect(parseOpapingouWebhookNotification(JSON.stringify({ type: 'other' }))?.eventId).not.toBe(
      notification?.eventId,
    );
  });

  it.each([
    ['the old presumed format', { id: 'evt_1', evento: 'pingou', cobranca: { valor: '99.90' } }],
    ['an empty object', {}],
  ])('accepts %s without reading it', (_label, body) => {
    expect(parseOpapingouWebhookNotification(JSON.stringify(body))).not.toBeNull();
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['an empty body', ''],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"pingou"'],
    ['a number', '42'],
  ])('returns null for %s', (_label, rawBody) => {
    expect(parseOpapingouWebhookNotification(rawBody)).toBeNull();
  });
});
