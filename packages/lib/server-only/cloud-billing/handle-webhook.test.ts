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

const SECRET = 'webhook-secret-for-tests';

const RAW_BODY = JSON.stringify({
  id: 'evt_1',
  evento: 'pingou',
  cobranca: { id: 'cob_1', referencia: 'charge_1', valor: '99.90' },
});

const sign = (rawBody: string) => signOpapingouWebhookBody({ rawBody, secret: SECRET });

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

    const result = await handleOpapingouWebhook({ rawBody: RAW_BODY, signature: sign(RAW_BODY) });

    expect(result).toEqual({ status: 404, outcome: 'DISABLED' });
  });

  it('refuses a body larger than the limit', async () => {
    const rawBody = 'a'.repeat(CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES + 1);

    const result = await handleOpapingouWebhook({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ status: 413, outcome: 'BODY_TOO_LARGE' });
  });

  it('measures the body in bytes, not characters', async () => {
    const rawBody = 'ã'.repeat(CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES / 2 + 1);

    const result = await handleOpapingouWebhook({ rawBody, signature: sign(rawBody) });

    expect(result.status).toBe(413);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['wrong', 'f'.repeat(64)],
  ])('is unauthorised with a %s signature', async (_label, signature) => {
    const result = await handleOpapingouWebhook({ rawBody: RAW_BODY, signature });

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it('is unauthorised when the body was changed after signing', async () => {
    const result = await handleOpapingouWebhook({
      rawBody: RAW_BODY.replace('99.90', '0.01'),
      signature: sign(RAW_BODY),
    });

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it('is unauthorised when no webhook secret is configured', async () => {
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', '');

    const signature = signOpapingouWebhookBody({ rawBody: RAW_BODY, secret: '' });

    const result = await handleOpapingouWebhook({ rawBody: RAW_BODY, signature });

    expect(result).toEqual({ status: 401, outcome: 'INVALID_SIGNATURE' });
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['an event without a name', JSON.stringify({ id: 'evt_1' })],
    ['an empty body', ''],
  ])('is a bad request for %s with a valid signature', async (_label, rawBody) => {
    const result = await handleOpapingouWebhook({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ status: 400, outcome: 'INVALID_BODY' });
  });
});
