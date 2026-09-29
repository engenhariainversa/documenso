import { describe, expect, it } from 'vitest';

import {
  parseOpapingouWebhookEvent,
  signOpapingouWebhookBody,
  verifyOpapingouWebhookSignature,
} from './opapingou-webhook';

const SECRET = 'webhook-secret-for-tests';

const PAYMENT_EVENT = {
  id: 'evt_1',
  evento: 'pingou',
  cobranca: {
    id: 'cob_1',
    referencia: 'charge_reference_1',
    valor: '99.90',
    status: 'pingou',
  },
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
    const tampered = RAW_BODY.replace('99.90', '99.91');

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

describe('parseOpapingouWebhookEvent', () => {
  it('reads a payment event', () => {
    expect(parseOpapingouWebhookEvent(RAW_BODY)).toEqual({
      eventId: 'evt_1',
      eventType: 'pingou',
      isPayment: true,
      providerChargeId: 'cob_1',
      reference: 'charge_reference_1',
      amountCents: 9990,
    });
  });

  it('reads a numeric amount', () => {
    const event = parseOpapingouWebhookEvent(
      JSON.stringify({ ...PAYMENT_EVENT, cobranca: { ...PAYMENT_EVENT.cobranca, valor: 99.9 } }),
    );

    expect(event?.amountCents).toBe(9990);
  });

  it('reads numeric ids as strings', () => {
    const event = parseOpapingouWebhookEvent(
      JSON.stringify({ id: 77, evento: 'pingou', cobranca: { id: 123, valor: '99.90' } }),
    );

    expect(event?.eventId).toBe('77');
    expect(event?.providerChargeId).toBe('123');
    expect(event?.reference).toBeNull();
  });

  it('leaves the amount null when it cannot be read', () => {
    const event = parseOpapingouWebhookEvent(
      JSON.stringify({ ...PAYMENT_EVENT, cobranca: { ...PAYMENT_EVENT.cobranca, valor: 'noventa' } }),
    );

    expect(event?.isPayment).toBe(true);
    expect(event?.amountCents).toBeNull();
  });

  it('derives a stable event id from the body when the provider sends none', () => {
    const { id: _id, ...withoutId } = PAYMENT_EVENT;

    const first = parseOpapingouWebhookEvent(JSON.stringify(withoutId));
    const second = parseOpapingouWebhookEvent(JSON.stringify(withoutId));
    const different = parseOpapingouWebhookEvent(JSON.stringify({ ...withoutId, evento: 'outro' }));

    expect(first?.eventId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second?.eventId).toBe(first?.eventId);
    expect(different?.eventId).not.toBe(first?.eventId);
  });

  it('flags other event types as not a payment', () => {
    const event = parseOpapingouWebhookEvent(JSON.stringify({ id: 'evt_2', evento: 'cobranca_expirada' }));

    expect(event).toEqual({
      eventId: 'evt_2',
      eventType: 'cobranca_expirada',
      isPayment: false,
      providerChargeId: null,
      reference: null,
      amountCents: null,
    });
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['an empty body', ''],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"pingou"'],
    ['an object without the event name', JSON.stringify({ id: 'evt_3' })],
    ['an empty event name', JSON.stringify({ id: 'evt_3', evento: '' })],
    ['a non-string event name', JSON.stringify({ id: 'evt_3', evento: 42 })],
  ])('returns null for %s', (_label, rawBody) => {
    expect(parseOpapingouWebhookEvent(rawBody)).toBeNull();
  });
});
