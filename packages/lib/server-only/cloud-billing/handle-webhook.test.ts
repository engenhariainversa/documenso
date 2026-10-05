import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { databaseCalls } = vi.hoisted(() => ({ databaseCalls: [] as string[] }));

// Every request in this file must be refused before the database is touched.
vi.mock('@documenso/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, property) => {
        databaseCalls.push(String(property));

        throw new Error(`Unexpected database access: ${String(property)}`);
      },
    },
  ),
}));

import { CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES, handleOpapingouWebhook } from './handle-webhook';
import { signOpapingouWebhookBody } from './providers/opapingou/opapingou-webhook';

const SECRET = 'whsec_webhook-secret-for-tests';

const NOW = new Date('2026-10-05T12:00:00.000Z');

const RAW_BODY = JSON.stringify({
  id: 'evt-unit-1',
  type: 'charge.paid',
  occurredAt: '2026-10-05T12:00:00.000Z',
  testMode: true,
  data: { type: 'charge', object: { id: 'charge-1', amountCents: 9990 } },
});

const sign = (rawBody: string, timestamp = NOW.getTime() / 1000) =>
  signOpapingouWebhookBody({ rawBody, secret: SECRET, timestamp });

const handle = async (
  rawBody: string,
  signature: string | null | undefined,
  headers: { eventIdHeader?: string; eventTypeHeader?: string } = {},
) => await handleOpapingouWebhook({ rawBody, signature, ...headers, now: NOW });

describe('handleOpapingouWebhook without touching the database', () => {
  beforeEach(() => {
    databaseCalls.length = 0;

    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();

    expect(databaseCalls).toEqual([]);
  });

  it('is not found when billing is disabled, even with a valid signature', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', '');

    const result = await handle(RAW_BODY, sign(RAW_BODY));

    expect(result).toEqual({ status: 404, outcome: 'DISABLED' });
  });

  it('refuses a body larger than the limit', async () => {
    const rawBody = 'a'.repeat(CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES + 1);

    const result = await handle(rawBody, sign(rawBody));

    expect(result).toEqual({ status: 413, outcome: 'BODY_TOO_LARGE' });
  });

  it('measures the body in bytes, not characters', async () => {
    const rawBody = 'ã'.repeat(CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES / 2 + 1);

    const result = await handle(rawBody, sign(rawBody));

    expect(result.status).toBe(413);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['wrong', `t=${NOW.getTime() / 1000},v1=${'f'.repeat(64)}`],
    ['in the old presumed format', 'f'.repeat(64)],
  ])('is unauthorised with a %s signature', async (_label, signature) => {
    const result = await handle(RAW_BODY, signature);

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it('is unauthorised when the body was changed after signing', async () => {
    const result = await handle(RAW_BODY.replace('9990', '1'), sign(RAW_BODY));

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it('is unauthorised when the signature is older than the tolerance (replay)', async () => {
    const result = await handle(RAW_BODY, sign(RAW_BODY, NOW.getTime() / 1000 - 301));

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it('is unauthorised when no webhook secret is configured', async () => {
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', '');

    const signature = signOpapingouWebhookBody({ rawBody: RAW_BODY, secret: '', timestamp: NOW.getTime() / 1000 });

    const result = await handle(RAW_BODY, signature);

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['an empty body', ''],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['an event without id', JSON.stringify({ type: 'charge.paid' })],
    [
      'charge.paid without the charge id',
      JSON.stringify({ id: 'evt-unit-2', type: 'charge.paid', data: { type: 'charge', object: {} } }),
    ],
  ])('is a bad request for %s with a valid signature', async (_label, rawBody) => {
    const result = await handle(rawBody, sign(rawBody));

    expect(result).toEqual({ status: 400, outcome: 'INVALID_BODY' });
  });

  it.each([
    ['Opa-Event-Id', { eventIdHeader: 'evt-other' }],
    ['Opa-Event-Type', { eventTypeHeader: 'ping' }],
  ])('is a bad request when %s disagrees with the signed body', async (_label, headers) => {
    const result = await handle(RAW_BODY, sign(RAW_BODY), headers);

    expect(result).toEqual({ status: 400, outcome: 'INVALID_BODY' });
  });
});
