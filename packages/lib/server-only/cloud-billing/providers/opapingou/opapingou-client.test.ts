import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, AppErrorCode } from '../../../../errors/app-error';
import { createOpapingouCharge, getOpapingouCharge } from './opapingou-client';
import {
  SIMULATED_OPAPINGOU_API_KEY,
  startSimulatedOpapingouApi,
  type TSimulatedOpapingouApi,
} from './simulated-opapingou-api';

const CHARGE = {
  amountCents: 9990,
  description: 'Docverse Cloud',
  idempotencyKey: 'charge_reference_1',
};

/**
 * A `Charge` object as the provider's reference describes it.
 */
const providerCharge = (overrides: Record<string, unknown> = {}) => ({
  id: 'c0ffee00-0000-4000-8000-000000000001',
  amountCents: 9990,
  status: 'PENDING',
  brCode: '00020126pix',
  paymentLink: null,
  expiresAt: '2026-10-16T12:00:00.000Z',
  paidAt: null,
  ...overrides,
});

const catchError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return AppError.parseError(err);
  }

  throw new Error('Expected the promise to reject');
};

describe('opapingou client', () => {
  let api: TSimulatedOpapingouApi;

  beforeEach(async () => {
    api = await startSimulatedOpapingouApi();

    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', api.url);
    vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', SIMULATED_OPAPINGOU_API_KEY);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();

    await api.close();
  });

  describe('createOpapingouCharge', () => {
    it('posts a JSON charge in cents with the bearer key and an idempotency key', async () => {
      await createOpapingouCharge(CHARGE);

      expect(api.requests).toHaveLength(1);

      const [request] = api.requests;

      expect(request.method).toBe('POST');
      expect(request.path).toBe('/v1/charges');
      expect(request.headers.authorization).toBe(`Bearer ${SIMULATED_OPAPINGOU_API_KEY}`);
      expect(request.headers['content-type']).toContain('application/json');
      expect(request.headers['idempotency-key']).toBe('charge_reference_1');
      expect(JSON.parse(request.body)).toEqual({
        amountCents: 9990,
        description: 'Docverse Cloud',
        validity: 'ONE_DAY',
        kind: 'PIX_QR',
      });
    });

    it('maps the provider charge to a neutral charge', async () => {
      const charge = await createOpapingouCharge(CHARGE);

      expect(charge.providerChargeId).toMatch(/^[0-9a-f-]{36}$/);
      expect(charge.paymentUrl).toBeNull();
      expect(charge.pixCopyPaste).toBe(`00020126SIMULADO${charge.providerChargeId}`);
      expect(charge.expiresAt?.toISOString()).toBe('2026-10-16T12:00:00.000Z');
    });

    it('creates a single charge when the same request is retried', async () => {
      const first = await createOpapingouCharge(CHARGE);
      const second = await createOpapingouCharge(CHARGE);

      expect(second.providerChargeId).toBe(first.providerChargeId);
    });

    it('keeps the payment link when the provider sends one', async () => {
      api.setNextResponse({
        status: 201,
        body: JSON.stringify(providerCharge({ paymentLink: 'https://pagamento.invalid/abc', brCode: null })),
      });

      const charge = await createOpapingouCharge(CHARGE);

      expect(charge.paymentUrl).toBe('https://pagamento.invalid/abc');
      expect(charge.pixCopyPaste).toBeNull();
    });

    it('accepts a charge without the optional fields', async () => {
      api.setNextResponse({
        status: 201,
        body: JSON.stringify({ id: 'minimal', amountCents: 9990, status: 'PENDING' }),
      });

      const charge = await createOpapingouCharge(CHARGE);

      expect(charge).toEqual({
        providerChargeId: 'minimal',
        paymentUrl: null,
        pixCopyPaste: null,
        expiresAt: null,
      });
    });

    it('ignores a payment link that is not http(s)', async () => {
      api.setNextResponse({
        status: 201,
        body: JSON.stringify(providerCharge({ paymentLink: 'javascript:alert(1)' })),
      });

      const charge = await createOpapingouCharge(CHARGE);

      expect(charge.paymentUrl).toBeNull();
    });

    it('ignores an expiry that is not a date', async () => {
      api.setNextResponse({ status: 201, body: JSON.stringify(providerCharge({ expiresAt: 'amanha' })) });

      const charge = await createOpapingouCharge(CHARGE);

      expect(charge.expiresAt).toBeNull();
    });

    it('fails when the provider created a charge for another amount', async () => {
      api.setNextResponse({ status: 201, body: JSON.stringify(providerCharge({ amountCents: 999 })) });

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    });

    it('fails without sending anything when the API key is missing', async () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', '');

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.NOT_SETUP);
      expect(api.requests).toHaveLength(0);
    });

    it('fails when the provider rejects the key, without leaking it', async () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', 'wrong-key-value');

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
      expect(JSON.stringify(error)).not.toContain('wrong-key-value');
      expect(error.message).not.toContain('wrong-key-value');
      expect(error.message).toContain('401');
    });

    it('fails on a problem+json error, without echoing the response body', async () => {
      api.setNextResponse({
        status: 500,
        body: JSON.stringify({ type: 'about:blank', title: 'Error', status: 500, detail: 'detalhe-interno' }),
        headers: { 'content-type': 'application/problem+json' },
      });

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
      expect(error.message).toContain('500');
      expect(error.message).not.toContain('detalhe-interno');
    });

    it.each([
      ['has no id', { amountCents: 9990, status: 'PENDING' }],
      ['has the amount in reais', providerCharge({ amountCents: '99.90' })],
      ['has an unknown status', providerCharge({ status: 'pingou' })],
      ['is the old presumed format', { id: 'cob_1', url_pagamento: 'https://x.invalid', pix_copia_e_cola: 'x' }],
    ])('fails when the response %s', async (_label, body) => {
      api.setNextResponse({ status: 201, body: JSON.stringify(body) });

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    });

    it('fails when the response is not JSON', async () => {
      api.setNextResponse({ status: 200, body: '<html>gateway</html>' });

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
      expect(error.message).not.toContain('gateway');
    });

    it('gives up when the provider takes longer than the timeout', async () => {
      api.setNextResponse({ status: 201, body: JSON.stringify(providerCharge()), delayMs: 3000 });

      const startedAt = Date.now();

      const error = await catchError(createOpapingouCharge({ ...CHARGE, timeoutMs: 200 }));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
      expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('does not follow redirects, so the key never reaches another host', async () => {
      const otherHost = await startSimulatedOpapingouApi();

      api.setNextResponse({
        status: 307,
        body: '',
        headers: { location: `${otherHost.url}/charges` },
      });

      const error = await catchError(createOpapingouCharge(CHARGE));

      await otherHost.close();

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
      expect(otherHost.requests).toHaveLength(0);
    });

    it('fails when the provider is unreachable', async () => {
      await api.close();

      const error = await catchError(createOpapingouCharge(CHARGE));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    });

    it.each([0, -1, 99.5, Number.NaN])('rejects the invalid amount %s before calling the provider', async (amount) => {
      const error = await catchError(createOpapingouCharge({ ...CHARGE, amountCents: amount }));

      expect(error.code).toBe(AppErrorCode.INVALID_REQUEST);
      expect(api.requests).toHaveLength(0);
    });
  });

  describe('getOpapingouCharge', () => {
    it('reads a pending charge with the bearer key', async () => {
      const { providerChargeId } = await createOpapingouCharge(CHARGE);

      const state = await getOpapingouCharge({ providerChargeId });

      const request = api.requests[1];

      expect(request.method).toBe('GET');
      expect(request.path).toBe(`/v1/charges/${providerChargeId}`);
      expect(request.headers.authorization).toBe(`Bearer ${SIMULATED_OPAPINGOU_API_KEY}`);
      expect(state).toEqual({
        providerChargeId,
        status: 'PENDING',
        isPaid: false,
        amountCents: 9990,
        paidAt: null,
      });
    });

    it('reports a paid charge with its payment date', async () => {
      const { providerChargeId } = await createOpapingouCharge(CHARGE);

      api.updateCharge(providerChargeId, { status: 'PAID', paidAt: '2026-10-15T12:04:00.000Z' });

      const state = await getOpapingouCharge({ providerChargeId });

      expect(state?.isPaid).toBe(true);
      expect(state?.status).toBe('PAID');
      expect(state?.paidAt?.toISOString()).toBe('2026-10-15T12:04:00.000Z');
    });

    it.each(['EXPIRED', 'CANCELED'] as const)('does not treat a %s charge as paid', async (status) => {
      const { providerChargeId } = await createOpapingouCharge(CHARGE);

      api.updateCharge(providerChargeId, { status });

      const state = await getOpapingouCharge({ providerChargeId });

      expect(state?.isPaid).toBe(false);
      expect(state?.status).toBe(status);
    });

    it('escapes the charge id in the path', async () => {
      await getOpapingouCharge({ providerChargeId: '../bank-accounts' });

      expect(api.requests[0].path).toBe('/v1/charges/..%2Fbank-accounts');
    });

    it('fails when the provider answers with another charge', async () => {
      api.setNextResponse({ status: 200, body: JSON.stringify(providerCharge({ id: 'another' })) });

      const error = await catchError(getOpapingouCharge({ providerChargeId: 'expected' }));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    });

    it('returns null when the provider does not know the charge', async () => {
      expect(await getOpapingouCharge({ providerChargeId: 'unknown' })).toBeNull();
    });

    it('fails on any other error status', async () => {
      api.setNextResponse({ status: 503, body: '' });

      const error = await catchError(getOpapingouCharge({ providerChargeId: 'any' }));

      expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
      expect(error.message).toContain('503');
    });
  });
});
