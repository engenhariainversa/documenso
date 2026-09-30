import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Opa Pingou webhook verification.
 *
 * The provider's REST reference (a PREVIEW, checked on 2026-09-30, see
 * `opapingou-client.ts`) documents outgoing webhooks: an endpoint registered at
 * `/v1/webhook-endpoints`, each delivery signed with HMAC using the endpoint's
 * secret, deliveries logged and redeliverable. Everything else is "A definir"
 * (undecided): the list of events, the body, the signature header, the algorithm
 * and what exactly is signed, the retry policy and the response timeout.
 *
 * So the body is never trusted nor interpreted: an authentic delivery only tells
 * Docverse to read its pending charges back from the API (`getOpapingouCharge`),
 * and only the charge the API reports as PAID activates a subscription. The same
 * rule the provider applies to the banks it receives webhooks from.
 *
 * - DOCUMENTED: HMAC signature with the endpoint secret
 * - ASSUMED: header `x-opapingou-signature`
 * - ASSUMED: hex HMAC-SHA256 of the raw body, optionally prefixed with `sha256=`
 * - DOCUMENTED: the body is JSON; its shape is UNDECIDED and not read
 */
export const OPAPINGOU_SIGNATURE_HEADER = 'x-opapingou-signature';

const SIGNATURE_PREFIX = 'sha256=';

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * The provider's event types are not documented, so every delivery is recorded as this.
 */
export const OPAPINGOU_NOTIFICATION_EVENT_TYPE = 'notification';

/**
 * An authentic webhook delivery, in provider-neutral terms.
 */
export type TProviderWebhookNotification = {
  /**
   * "sha256:<hash of the body>". The provider's event id is not documented, so a
   * delivery is identified by its bytes.
   */
  eventId: string;
  eventType: string;
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

/**
 * Returns null unless the body is a JSON object, the only thing the reference says
 * about it.
 */
export const parseOpapingouWebhookNotification = (rawBody: string): TProviderWebhookNotification | null => {
  const body = parseJson(rawBody);

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  return {
    eventId: `sha256:${createHash('sha256').update(rawBody, 'utf8').digest('hex')}`,
    eventType: OPAPINGOU_NOTIFICATION_EVENT_TYPE,
  };
};

const parseJson = (rawBody: string): unknown => {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
};
