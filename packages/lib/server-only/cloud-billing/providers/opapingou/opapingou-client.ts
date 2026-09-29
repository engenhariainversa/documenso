import { z } from 'zod';

import { OPAPINGOU_API_KEY, OPAPINGOU_API_URL } from '../../../../constants/cloud-billing';
import { AppError, AppErrorCode } from '../../../../errors/app-error';
import { formatCentsAsDecimal } from '../../../../universal/cloud-billing/money';

/**
 * Opa Pingou charge creation.
 *
 * The provider publishes no API reference. Only the items marked PUBLISHED below
 * appear on its website (a single curl example); everything marked ASSUMED is a
 * guess that must be checked against the real documentation before billing is
 * turned on. Keep every assumption about the API shape inside this file.
 *
 * - PUBLISHED: POST {base}/cobranca
 * - PUBLISHED: Authorization: Bearer <key>
 * - PUBLISHED: form-encoded body, `valor` as a decimal amount in reais
 * - ASSUMED: `referencia` and `descricao` request fields
 * - ASSUMED: `id`, `url_pagamento`, `pix_copia_e_cola` and `expira_em` response fields
 */
const OPAPINGOU_CHARGE_PATH = '/cobranca';

const DEFAULT_TIMEOUT_MS = 10_000;

const ZOpapingouChargeResponseSchema = z.object({
  id: z.union([z.string().min(1), z.number()]).transform((value) => String(value)),
  url_pagamento: z.string().nullish(),
  pix_copia_e_cola: z.string().nullish(),
  expira_em: z.string().nullish(),
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

export type CreateOpapingouChargeOptions = {
  amountCents: number;

  /**
   * Our own identifier for the charge, echoed back by the provider in the webhook.
   */
  reference: string;
  description: string;
  timeoutMs?: number;
};

export const createOpapingouCharge = async ({
  amountCents,
  reference,
  description,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: CreateOpapingouChargeOptions): Promise<TProviderCharge> => {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Charge amount must be a positive integer amount of cents',
    });
  }

  const apiKey = OPAPINGOU_API_KEY();

  if (!apiKey) {
    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: 'Payment provider API key is not configured',
    });
  }

  const body = new URLSearchParams({
    valor: formatCentsAsDecimal(amountCents),
    referencia: reference,
    descricao: description,
  });

  const response = await fetch(`${OPAPINGOU_API_URL()}${OPAPINGOU_CHARGE_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    // Never follow redirects: the request carries the API key.
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => {
    // The underlying error is dropped on purpose: it can carry request details.
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider request failed or timed out',
    });
  });

  if (!response.ok) {
    // The response body is never included: it is provider controlled.
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: `Payment provider responded with status ${response.status}`,
    });
  }

  const json: unknown = await response.json().catch(() => null);

  const parsed = ZOpapingouChargeResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Payment provider response did not match the expected format',
    });
  }

  return {
    providerChargeId: parsed.data.id,
    paymentUrl: parseHttpUrl(parsed.data.url_pagamento),
    pixCopyPaste: parsed.data.pix_copia_e_cola || null,
    expiresAt: parseDate(parsed.data.expira_em),
  };
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
