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
 * - ASSUMED: a paid charge has `status: "pingou"`
 * - UNKNOWN: whether `valor` is the gross amount or the amount net of the provider's
 *   `taxa`. The handler compares it with the amount charged, so a net amount would
 *   reject every payment.
 */
export const OPAPINGOU_SIGNATURE_HEADER = 'x-opapingou-signature';

const OPAPINGOU_PAYMENT_EVENT = 'pingou';

const SIGNATURE_PREFIX = 'sha256=';

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * ASSUMED: the status a paid charge carries. It is the only status the provider
 * publishes, and it shows it on a charge that was just created, so the event name
 * alone is not trusted: when the status is sent, it must say the charge was paid.
 */
const OPAPINGOU_PAID_CHARGE_STATUS = 'pingou';

/**
 * Identifiers end up in a unique index, so their size is bounded.
 */
const MAX_IDENTIFIER_LENGTH = 255;

const ZOpapingouIdSchema = z
  .union([z.string().min(1).max(MAX_IDENTIFIER_LENGTH), z.number()])
  .transform((value) => String(value));

const ZOpapingouWebhookSchema = z.object({
  id: ZOpapingouIdSchema.nullish(),
  evento: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  cobranca: z
    .object({
      id: ZOpapingouIdSchema.nullish(),
      referencia: z.string().min(1).max(MAX_IDENTIFIER_LENGTH).nullish(),
      valor: z.union([z.string(), z.number()]).nullish(),
      status: z.string().nullish(),
    })
    .nullish(),
});

/**
 * A payment provider webhook event, in provider-neutral terms.
 */
export type TProviderWebhookEvent = {
  /**
   * "<event type>:<provider's event id>", or "sha256:<hash of the body>" when the
   * provider sends no id.
   *
   * The event type is part of the id because it is not known whether the provider's
   * id is unique per event or per charge. If it is per charge, an earlier event of
   * another type must not be mistaken for the payment.
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
  const chargeStatus = cobranca?.status;

  const isPaidStatus =
    chargeStatus === null || chargeStatus === undefined || chargeStatus === OPAPINGOU_PAID_CHARGE_STATUS;

  return {
    eventId: id ? `${evento}:${id}` : `sha256:${createHash('sha256').update(rawBody, 'utf8').digest('hex')}`,
    eventType: evento,
    isPayment: evento === OPAPINGOU_PAYMENT_EVENT && isPaidStatus,
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
