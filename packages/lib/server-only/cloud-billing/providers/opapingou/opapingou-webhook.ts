import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { parseDecimalToCents } from '../../../../universal/cloud-billing/money';

/**
 * Opa Pingou webhook verification and parsing.
 *
 * The provider only publishes the NAME of its payment webhook ("pingou"). The
 * signature scheme and the payload shape below are ASSUMED and must be checked
 * against the real documentation before billing is turned on. Keep every
 * assumption about the webhook shape inside this file.
 *
 * - ASSUMED: header `x-opapingou-signature`
 * - ASSUMED: hex HMAC-SHA256 of the raw body, optionally prefixed with `sha256=`
 * - ASSUMED: body `{ id, evento, cobranca: { id, referencia, valor, status } }`
 */
export const OPAPINGOU_SIGNATURE_HEADER = 'x-opapingou-signature';

const OPAPINGOU_PAYMENT_EVENT = 'pingou';

const SIGNATURE_PREFIX = 'sha256=';

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

const ZOpapingouIdSchema = z.union([z.string().min(1), z.number()]).transform((value) => String(value));

const ZOpapingouWebhookSchema = z.object({
  id: ZOpapingouIdSchema.nullish(),
  evento: z.string().min(1),
  cobranca: z
    .object({
      id: ZOpapingouIdSchema.nullish(),
      referencia: z.string().min(1).nullish(),
      valor: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
});

/**
 * A payment provider webhook event, in provider-neutral terms.
 */
export type TProviderWebhookEvent = {
  /**
   * The provider's event id, or "sha256:<hash of the body>" when it sends none.
   */
  eventId: string;
  eventType: string;
  isPayment: boolean;
  providerChargeId: string | null;

  /**
   * Our own charge id, as sent when the charge was created.
   */
  reference: string | null;
  amountCents: number | null;
};

export type SignOpapingouWebhookBodyOptions = {
  rawBody: string;
  secret: string;
};

export const signOpapingouWebhookBody = ({ rawBody, secret }: SignOpapingouWebhookBodyOptions) => {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
};

export type VerifyOpapingouWebhookSignatureOptions = {
  rawBody: string;
  signature: string | null | undefined;
  secret: string | null | undefined;
};

/**
 * Fails closed: without a configured secret nothing is ever accepted.
 */
export const verifyOpapingouWebhookSignature = ({
  rawBody,
  signature,
  secret,
}: VerifyOpapingouWebhookSignatureOptions) => {
  if (!secret || !signature) {
    return false;
  }

  const normalised = signature.trim().toLowerCase();

  const received = normalised.startsWith(SIGNATURE_PREFIX) ? normalised.slice(SIGNATURE_PREFIX.length) : normalised;

  if (!SHA256_HEX_REGEX.test(received)) {
    return false;
  }

  const expected = signOpapingouWebhookBody({ rawBody, secret });

  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
};

export const parseOpapingouWebhookEvent = (rawBody: string): TProviderWebhookEvent | null => {
  const parsed = ZOpapingouWebhookSchema.safeParse(parseJson(rawBody));

  if (!parsed.success) {
    return null;
  }

  const { id, evento, cobranca } = parsed.data;

  const amount = cobranca?.valor;

  return {
    eventId: id ?? `sha256:${createHash('sha256').update(rawBody, 'utf8').digest('hex')}`,
    eventType: evento,
    isPayment: evento === OPAPINGOU_PAYMENT_EVENT,
    providerChargeId: cobranca?.id ?? null,
    reference: cobranca?.referencia ?? null,
    amountCents: amount === null || amount === undefined ? null : parseDecimalToCents(amount),
  };
};

const parseJson = (rawBody: string): unknown => {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
};
