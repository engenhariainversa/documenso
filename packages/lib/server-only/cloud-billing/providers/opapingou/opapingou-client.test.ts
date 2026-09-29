import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, AppErrorCode } from '../../../../errors/app-error';
import { createOpapingouCharge } from './opapingou-client';
import {
  SIMULATED_OPAPINGOU_API_KEY,
  startSimulatedOpapingouApi,
  type TSimulatedOpapingouApi,
} from './simulated-opapingou-api';

const CHARGE = {
  amountCents: 9990,
  reference: 'charge_reference_1',
  description: 'Docverse Cloud',
};

const catchError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return AppError.parseError(err);
  }

  throw new Error('Expected the promise to reject');
};

describe('createOpapingouCharge', () => {
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

  it('posts a form-encoded charge with the bearer key', async () => {
    await createOpapingouCharge(CHARGE);

    expect(api.requests).toHaveLength(1);

    const [request] = api.requests;
    const params = new URLSearchParams(request.body);

    expect(request.method).toBe('POST');
    expect(request.path).toBe('/v1/cobranca');
    expect(request.headers.authorization).toBe(`Bearer ${SIMULATED_OPAPINGOU_API_KEY}`);
    expect(request.headers['content-type']).toContain('application/x-www-form-urlencoded');
    expect(params.get('valor')).toBe('99.90');
    expect(params.get('referencia')).toBe('charge_reference_1');
    expect(params.get('descricao')).toBe('Docverse Cloud');
  });

  it('maps the provider response to a neutral charge', async () => {
    const charge = await createOpapingouCharge(CHARGE);

    expect(charge.providerChargeId).toMatch(/^cob_/);
    expect(charge.paymentUrl).toBe(`https://pagamento.invalid/${charge.providerChargeId}`);
    expect(charge.pixCopyPaste).toBe(`00020126SIMULADO${charge.providerChargeId}`);
    expect(charge.expiresAt?.toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });

  it('accepts a response that only has the charge id', async () => {
    api.setNextResponse({ status: 200, body: JSON.stringify({ id: 'cob_minimal' }) });

    const charge = await createOpapingouCharge(CHARGE);

    expect(charge).toEqual({
      providerChargeId: 'cob_minimal',
      paymentUrl: null,
      pixCopyPaste: null,
      expiresAt: null,
    });
  });

  it('accepts a numeric charge id', async () => {
    api.setNextResponse({ status: 200, body: JSON.stringify({ id: 12345 }) });

    const charge = await createOpapingouCharge(CHARGE);

    expect(charge.providerChargeId).toBe('12345');
  });

  it('ignores a payment URL that is not http(s)', async () => {
    api.setNextResponse({
      status: 200,
      body: JSON.stringify({ id: 'cob_js', url_pagamento: 'javascript:alert(1)' }),
    });

    const charge = await createOpapingouCharge(CHARGE);

    expect(charge.paymentUrl).toBeNull();
  });

  it('ignores an expiry that is not a date', async () => {
    api.setNextResponse({ status: 200, body: JSON.stringify({ id: 'cob_date', expira_em: 'amanha' }) });

    const charge = await createOpapingouCharge(CHARGE);

    expect(charge.expiresAt).toBeNull();
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

  it('fails on a provider error, without echoing the response body', async () => {
    api.setNextResponse({ status: 500, body: JSON.stringify({ erro: 'detalhe-interno-do-provedor' }) });

    const error = await catchError(createOpapingouCharge(CHARGE));

    expect(error.code).toBe(AppErrorCode.UNKNOWN_ERROR);
    expect(error.message).toContain('500');
    expect(error.message).not.toContain('detalhe-interno-do-provedor');
  });

  it('fails when the response has no charge id', async () => {
    api.setNextResponse({ status: 200, body: JSON.stringify({ status: 'pingou', banco: 'inter' }) });

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
    api.setNextResponse({ status: 200, body: JSON.stringify({ id: 'cob_slow' }), delayMs: 3000 });

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
      headers: { location: `${otherHost.url}/cobranca` },
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
