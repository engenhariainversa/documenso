import { z } from 'zod';

import { OPAPINGOU_API_KEY, OPAPINGOU_API_URL } from '../../../../constants/cloud-billing';
import { AppError, AppErrorCode } from '../../../../errors/app-error';

/**
 * Opa Pingou charges.
 *
 * Contract: the REST reference published by the provider at `/docs` (checked on
 * 2026-09-30, source `apps/web/src/content/api-docs.ts` of the provider's repository).
 * That reference is a PREVIEW: it says the REST layer does not exist yet and may
 * change. Items it marks "A definir" (undecided) are labelled UNDECIDED below and
 * must be checked again before billing is turned on. Keep every assumption about the
 * API shape inside this file.
 *
 * - DOCUMENTED: POST {base}/v1/charges and GET {base}/v1/charges/{id}, JSON in and out
 * - DOCUMENTED: request `amountCents` (integer), `description`, `validity`, `kind`
 * - DOCUMENTED: `Idempotency-Key` header on charge creation
 * - DOCUMENTED: response `Charge` with `id`, `amountCents`, `status`
 *   (`PENDING | PAID | EXPIRED | CANCELED`), `brCode`, `paymentLink`, `expiresAt`, `paidAt`
 * - DOCUMENTED: scopes `charges:write` (create) and `charges:read` (read)
 * - UNDECIDED: `Authorization: Bearer <key>`, which the examples use
 * - UNDECIDED: whether `Idempotency-Key` is required, how long it is remembered
 * - UNDECIDED: final base URL and a sandbox environment
 * - UNDECIDED: error codes inside the `application/problem+json` body (never read here)
 */
const OPAPINGOU_CHARGES_PATH = '/charges';

/**
 * How long a charge can be paid. The provider only offers fixed windows; one day
 * matches how long Docverse hands a pending charge back to the user.
 */
const OPAPINGOU_CHARGE_VALIDITY = 'ONE_DAY';

/**
 * A Pix QR code. `PAYMENT_LINK` needs a Mercado Pago account on the provider's side.
 */
const OPAPINGOU_CHARGE_KIND = 'PIX_QR';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Identifiers end up in a unique index and in a URL path, so their size is bounded.
 */
const MAX_IDENTIFIER_LENGTH = 255;

export const ZOpapingouChargeStatusSchema = z.enum(['PENDING', 'PAID', 'EXPIRED', 'CANCELED']);

export type TOpapingouChargeStatus = z.infer<typeof ZOpapingouChargeStatusSchema>;

const ZOpapingouChargeSchema = z.object({
  id: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  amountCents: z.number().int(),
  status: ZOpapingouChargeStatusSchema,
  brCode: z.string().nullish(),
  paymentLink: z.string().nullish(),
  expiresAt: z.string().nullish(),
  paidAt: z.string().nullish(),
});

/**
 * A charge created at the payment provider, in provider-neutral terms.
 */
export type TProviderCharge = {
  providerChargeId: string;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
  expiresAt: Date | null;
};

/**
 * The state of a charge as the provider reports it, in provider-neutral terms.
 */
export type TProviderChargeState = {
  providerChargeId: string;
  status: TOpapingouChargeStatus;
  isPaid: boolean;
  amountCents: number;
  paidAt: Date | null;
};

export type CreateOpapingouChargeOptions = {
  amountCents: number;
  description: string;

  /**
   * Sent as `Idempotency-Key`, so a retried request never creates a second charge.
   * Our own charge id.
   */
  idempotencyKey: string;
  timeoutMs?: number;
};

export const createOpapingouCharge = async ({
  amountCents,
  description,
  idempotencyKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: CreateOpapingouChargeOptions): Promise<TProviderCharge> => {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Charge amount must be a positive integer amount of cents',
    });
  }

  const charge = await requestOpapingouCharge({
    method: 'POST',
    path: OPAPINGOU_CHARGES_PATH,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      amountCents,
      description,
      validity: OPAPINGOU_CHARGE_VALIDITY,
      kind: OPAPINGOU_CHARGE_KIND,
    }),
    timeoutMs,
  });

  if (!charge) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider responded with status 404',
    });
  }

  // A charge for another amount would never be accepted as payment, so it is refused now.
  if (charge.amountCents !== amountCents) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider created a charge for a different amount',
    });
  }

  return {
    providerChargeId: charge.id,
    paymentUrl: parseHttpUrl(charge.paymentLink),
    pixCopyPaste: charge.brCode || null,
    expiresAt: parseDate(charge.expiresAt),
  };
};

export type GetOpapingouChargeOptions = {
  providerChargeId: string;
  timeoutMs?: number;
};

/**
 * Reads a charge from the provider. This, not a webhook body, is what confirms a payment.
 *
 * Returns null when the provider does not know the charge (404): asking again would
 * not change the answer.
 */
export const getOpapingouCharge = async ({
  providerChargeId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GetOpapingouChargeOptions): Promise<TProviderChargeState | null> => {
  const charge = await requestOpapingouCharge({
    method: 'GET',
    path: `${OPAPINGOU_CHARGES_PATH}/${encodeURIComponent(providerChargeId)}`,
    isNotFoundAllowed: true,
    timeoutMs,
  });

  if (!charge) {
    return null;
  }

  if (charge.id !== providerChargeId) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider answered with another charge',
    });
  }

  return {
    providerChargeId: charge.id,
    status: charge.status,
    isPaid: charge.status === 'PAID',
    amountCents: charge.amountCents,
    paidAt: parseDate(charge.paidAt),
  };
};

type RequestOpapingouChargeOptions = {
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  isNotFoundAllowed?: boolean;
  timeoutMs: number;
};

/**
 * Returns null only for a 404 when `isNotFoundAllowed` is set.
 */
const requestOpapingouCharge = async ({
  method,
  path,
  headers,
  body,
  isNotFoundAllowed = false,
  timeoutMs,
}: RequestOpapingouChargeOptions) => {
  const apiKey = OPAPINGOU_API_KEY();

  if (!apiKey) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'Payment provider API key is not configured',
    });
  }

  const response = await fetch(`${OPAPINGOU_API_URL()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...headers,
    },
    body,
    // Never follow redirects: the request carries the API key.
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => {
    // The underlying error is dropped on purpose: it can carry request details.
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider request failed or timed out',
    });
  });

  if (isNotFoundAllowed && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    // The response body is never included: it is provider controlled.
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: `Payment provider responded with status ${response.status}`,
    });
  }

  const json: unknown = await response.json().catch(() => null);

  const parsed = ZOpapingouChargeSchema.safeParse(json);

  if (!parsed.success) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider response did not match the expected format',
    });
  }

  return parsed.data;
};

/**
 * Only http(s) URLs are kept, since the value ends up in a link the user clicks.
 */
const parseHttpUrl = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

const parseDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};
