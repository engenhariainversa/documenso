import { describe, expect, it } from 'vitest';

import { AppError, AppErrorCode, genericErrorCodeToTrpcErrorCodeMap } from './app-error';

describe('SUBSCRIPTION_REQUIRED', () => {
  const error = new AppError(AppErrorCode.SUBSCRIPTION_REQUIRED, {
    message: 'An active subscription is required to send documents',
    statusCode: 402,
  });

  it('is a known error code', () => {
    expect(AppErrorCode.SUBSCRIPTION_REQUIRED).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('maps to 402 payment required on tRPC and the v2 API', () => {
    expect(genericErrorCodeToTrpcErrorCodeMap[AppErrorCode.SUBSCRIPTION_REQUIRED]).toEqual({
      code: 'PAYMENT_REQUIRED',
      status: 402,
    });
  });

  it('is a client error on the v1 API, with its message kept', () => {
    // The v1 contract declares no 402, so the closest declared status is used.
    expect(AppError.toRestAPIError(error)).toEqual({
      status: 400,
      body: { message: 'An active subscription is required to send documents' },
    });
  });

  it('keeps hiding the message of unknown errors on the v1 API', () => {
    expect(AppError.toRestAPIError(new Error('database password is hunter2'))).toEqual({
      status: 500,
      body: { message: 'Something went wrong' },
    });
  });
});
