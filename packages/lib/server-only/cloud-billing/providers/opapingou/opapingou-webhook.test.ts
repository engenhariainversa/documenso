import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS,
  parseOpapingouWebhookNotification,
  signOpapingouWebhookBody,
  verifyOpapingouWebhookSignature,
} from './opapingou-webhook';

const SECRET = 'whsec_webhook-secret-for-tests';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const TIMESTAMP = NOW.getTime() / 1000;

const CHARGE_ID = '9a8b7c6d-5e4f-4321-a0b1-c2d3e4f5a6b7';

// The body documented by the provider (spec §6.4).
const CHARGE_PAID_EVENT = {
  id: 'e6f7a8b9-0c1d-4e2f-83a4-b5c6d7e8f9a0',
  type: 'charge.paid',
  occurredAt: '2026-10-05T11:59:58.000Z',
  testMode: true,
  data: { type: 'charge', object: { id: CHARGE_ID, status: 'PAID', amountCents: 9990 } },
};

const RAW_BODY = JSON.stringify(CHARGE_PAID_EVENT);

const sign = (rawBody = RAW_BODY, timestamp = TIMESTAMP, secret = SECRET) =>
  signOpapingouWebhookBody({ rawBody, secret, timestamp });

const verify = (signature: string | null | undefined, rawBody = RAW_BODY, secret: string | null | undefined = SECRET) =>
  verifyOpapingouWebhookSignature({ rawBody, signature, secret, now: NOW });

describe('verifyOpapingouWebhookSignature', () => {
  it('produces t=<unix>,v1=<hex HMAC-SHA256 of "t.body">', () => {
    const expected = createHmac('sha256', SECRET).update(`${TIMESTAMP}.${RAW_BODY}`).digest('hex');

    expect(sign()).toBe(`t=${TIMESTAMP},v1=${expected}`);
  });

  it('accepts the correct signature', () => {
    expect(verify(sign())).toBe(true);
  });

  it('accepts an uppercase signature and spaces around the pairs', () => {
    const [t, v1] = sign().split(',');

    expect(verify(`${t}, v1=${v1.slice(3).toUpperCase()}`)).toBe(true);
  });

  it('accepts the pairs in any order and ignores unknown ones', () => {
    const [t, v1] = sign().split(',');

    expect(verify(`v0=abc,${v1},${t}`)).toBe(true);
  });

  it('accepts when any of several v1 values matches', () => {
    const [t, v1] = sign().split(',');

    expect(verify(`${t},v1=${'0'.repeat(64)},${v1}`)).toBe(true);
  });

  it(`accepts a timestamp ${OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS} seconds away, in either direction`, () => {
    expect(verify(sign(RAW_BODY, TIMESTAMP - OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS))).toBe(true);
    expect(verify(sign(RAW_BODY, TIMESTAMP + OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS))).toBe(true);
  });

  it('rejects a timestamp outside the tolerance (replay)', () => {
    expect(verify(sign(RAW_BODY, TIMESTAMP - OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS - 1))).toBe(false);
    expect(verify(sign(RAW_BODY, TIMESTAMP + OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS + 1))).toBe(false);
  });

  it('rejects a signature whose timestamp was changed', () => {
    const [, v1] = sign().split(',');

    expect(verify(`t=${TIMESTAMP + 1},${v1}`)).toBe(false);
  });

  it('rejects a body changed by one character', () => {
    expect(verify(sign(), RAW_BODY.replace('9990', '9991'))).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verify(sign(RAW_BODY, TIMESTAMP, 'whsec_another'))).toBe(false);
  });

  it('rejects the HMAC of the body alone (the previously assumed format)', () => {
    const bodyOnly = createHmac('sha256', SECRET).update(RAW_BODY).digest('hex');

    expect(verify(bodyOnly)).toBe(false);
    expect(verify(`t=${TIMESTAMP},v1=${bodyOnly}`)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['without t', `v1=${'a'.repeat(64)}`],
    ['without v1', `t=${TIMESTAMP}`],
    ['with a short v1', `t=${TIMESTAMP},v1=abcdef`],
    ['with a non-hex v1', `t=${TIMESTAMP},v1=${'z'.repeat(64)}`],
    ['with a non-numeric t', `t=abc,v1=${'a'.repeat(64)}`],
    ['made of garbage', ',,,==,'],
  ])('rejects a signature %s without throwing', (_label, value) => {
    expect(verify(value)).toBe(false);
  });

  it.each([undefined, null, ''])('always rejects when the secret is %j', (secret) => {
    expect(verify(sign(RAW_BODY, TIMESTAMP, ''), RAW_BODY, secret)).toBe(false);
  });

  it('verifies the exact bytes, not the parsed JSON', () => {
    expect(verify(sign(), JSON.stringify(CHARGE_PAID_EVENT, null, 2))).toBe(false);
  });
});

describe('parseOpapingouWebhookNotification', () => {
  it('reads the event id, type, mode and charge id of charge.paid', () => {
    expect(parseOpapingouWebhookNotification(RAW_BODY)).toEqual({
      eventId: CHARGE_PAID_EVENT.id,
      eventType: 'charge.paid',
      testMode: true,
      providerChargeId: CHARGE_ID,
      providerPaymentId: null,
      paymentChargeId: null,
      paymentAmountCents: null,
    });
  });

  it('reads ping, which has an empty object', () => {
    const ping = {
      id: 'evt-ping',
      type: 'ping',
      occurredAt: CHARGE_PAID_EVENT.occurredAt,
      testMode: false,
      data: { type: 'ping', object: {} },
    };

    expect(parseOpapingouWebhookNotification(JSON.stringify(ping))).toEqual({
      eventId: 'evt-ping',
      eventType: 'ping',
      testMode: false,
      providerChargeId: null,
      providerPaymentId: null,
      paymentChargeId: null,
      paymentAmountCents: null,
    });
  });

  it('does not take a charge id from an event about another resource', () => {
    const payment = {
      ...CHARGE_PAID_EVENT,
      type: 'payment.confirmed',
      data: { type: 'payment', object: { id: 'payment-id', charge: { id: CHARGE_ID } } },
    };

    expect(parseOpapingouWebhookNotification(JSON.stringify(payment))?.providerChargeId).toBeNull();
  });

  it.each(['payment.refunded', 'payment.charged_back'])('reads the payment and the charge it paid from %s', (type) => {
    const event = {
      ...CHARGE_PAID_EVENT,
      type,
      data: {
        type: 'payment',
        object: { id: 'payment-id', amountCents: 9990, status: 'REFUNDED', charge: { id: CHARGE_ID, kind: 'PIX_QR' } },
      },
    };

    expect(parseOpapingouWebhookNotification(JSON.stringify(event))).toMatchObject({
      eventType: type,
      providerChargeId: null,
      providerPaymentId: 'payment-id',
      paymentChargeId: CHARGE_ID,
      paymentAmountCents: 9990,
    });
  });

  it('reads a payment that did not come from a charge', () => {
    const event = {
      ...CHARGE_PAID_EVENT,
      type: 'payment.refunded',
      data: { type: 'payment', object: { id: 'payment-id', amountCents: 500, charge: null } },
    };

    expect(parseOpapingouWebhookNotification(JSON.stringify(event))).toMatchObject({
      providerPaymentId: 'payment-id',
      paymentChargeId: null,
    });
  });

  it('has no charge id when charge.paid comes without one', () => {
    const withoutObject = { ...CHARGE_PAID_EVENT, data: { type: 'charge', object: {} } };

    expect(parseOpapingouWebhookNotification(JSON.stringify(withoutObject))?.providerChargeId).toBeNull();
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['an empty body', ''],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"pingou"'],
    ['an object without id', JSON.stringify({ type: 'charge.paid' })],
    ['an object without type', JSON.stringify({ id: 'evt' })],
    ['the old presumed format', JSON.stringify({ evento: 'pingou', cobranca: { valor: '99.90' } })],
  ])('returns null for %s', (_label, rawBody) => {
    expect(parseOpapingouWebhookNotification(rawBody)).toBeNull();
  });
});
