import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Opa Pingou outbound webhooks.
 *
 * Contract: the provider's design spec `2026-10-03-api-rest-keys-webhooks-design.md`
 * (§6.4) and the "Webhooks" guide of its `/docs` page (`api-docs-guides.ts`), both on
 * the provider's `main` as of 2026-10-05.
 *
 * - Header `Opa-Signature: t=<unix seconds>,v1=<hex>`
 * - `v1 = hex(HMAC-SHA256(secret, "<t>.<raw body>"))`, the secret being the endpoint's
 *   `whsec_…`; every retry is signed again with a new `t`, the body does not change
 * - Reject when `|now - t|` exceeds 300 seconds; compare in constant time
 * - Body `{ id, type, occurredAt, testMode, data: { type, object } }`, where `object` is
 *   the resource as the REST API returns it (a `Charge` for `charge.*` events)
 * - Delivered at least once: deduplicate by `id`, also sent as the `Opa-Event-Id`
 *   header, next to `Opa-Event-Type` with the body's `type`. The headers are not
 *   signed, so the body is what counts; a header that disagrees with it is refused
 * - `ping` is the test event of an endpoint, signed like the others
 *
 * The body is authentic once the signature checks, but a payment is still only
 * accepted after reading the charge back from the API (see `handle-webhook.ts`).
 */
export const OPAPINGOU_SIGNATURE_HEADER = 'opa-signature';

export const OPAPINGOU_EVENT_ID_HEADER = 'opa-event-id';

export const OPAPINGOU_EVENT_TYPE_HEADER = 'opa-event-type';

export const OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS = 300;

export const OPAPINGOU_CHARGE_PAID_EVENT = 'charge.paid';

export const OPAPINGOU_PING_EVENT = 'ping';

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

const TIMESTAMP_REGEX = /^\d{1,12}$/;

/**
 * Identifiers end up in a unique index and in a URL path, so their size is bounded.
 */
const MAX_IDENTIFIER_LENGTH = 255;

const ZOpapingouWebhookEventSchema = z.object({
  id: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  type: z.string().min(1).max(64),
  occurredAt: z.string().optional(),
  testMode: z.boolean().optional(),
  data: z
    .object({
      type: z.string().optional(),
      object: z.unknown().optional(),
    })
    .optional(),
});

const ZOpapingouChargeObjectSchema = z.object({
  id: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
});

/**
 * An authentic webhook delivery, in provider-neutral terms.
 */
export type TProviderWebhookNotification = {
  /** The provider's event id. Redeliveries of the same event carry the same id. */
  eventId: string;
  eventType: string;
  testMode: boolean;

  /** The provider's charge id, for `charge.*` events. */
  providerChargeId: string | null;
};

const hmac = (secret: string, timestamp: number, rawBody: string) =>
  createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();

export type SignOpapingouWebhookBodyOptions = {
  rawBody: string;
  secret: string;
  timestamp: number;
};

/**
 * Builds an `Opa-Signature` value. Used by the tests and the simulated API.
 */
export const signOpapingouWebhookBody = ({ rawBody, secret, timestamp }: SignOpapingouWebhookBodyOptions) => {
  return `t=${timestamp},v1=${hmac(secret, timestamp, rawBody).toString('hex')}`;
};

export type VerifyOpapingouWebhookSignatureOptions = {
  rawBody: string;
  signature: string | null | undefined;
  secret: string | null | undefined;
  now?: Date;
};

/**
 * Fails closed: without a configured secret nothing is ever accepted. Never throws.
 */
export const verifyOpapingouWebhookSignature = ({
  rawBody,
  signature,
  secret,
  now = new Date(),
}: VerifyOpapingouWebhookSignatureOptions) => {
  if (!secret || !signature) {
    return false;
  }

  let timestamp: number | null = null;
  const candidates: string[] = [];

  for (const pair of signature.split(',')) {
    const separator = pair.indexOf('=');

    if (separator < 0) {
      continue;
    }

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();

    if (key === 't' && TIMESTAMP_REGEX.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && SHA256_HEX_REGEX.test(value)) {
      candidates.push(value);
    }
  }

  if (timestamp === null || candidates.length === 0) {
    return false;
  }

  if (Math.abs(now.getTime() / 1000 - timestamp) > OPAPINGOU_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = hmac(secret, timestamp, rawBody);

  let isMatch = false;

  // Every candidate is compared, so the time taken does not depend on which one matched.
  for (const candidate of candidates) {
    const received = Buffer.from(candidate, 'hex');

    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      isMatch = true;
    }
  }

  return isMatch;
};

/**
 * Returns null unless the body is an event in the documented format.
 */
export const parseOpapingouWebhookNotification = (rawBody: string): TProviderWebhookNotification | null => {
  const parsed = ZOpapingouWebhookEventSchema.safeParse(parseJson(rawBody));

  if (!parsed.success) {
    return null;
  }

  const event = parsed.data;

  const isChargeEvent = event.type.startsWith('charge.') && event.data?.type === 'charge';

  const charge = isChargeEvent ? ZOpapingouChargeObjectSchema.safeParse(event.data?.object) : null;

  return {
    eventId: event.id,
    eventType: event.type,
    testMode: event.testMode ?? false,
    providerChargeId: charge?.success ? charge.data.id : null,
  };
};

const parseJson = (rawBody: string): unknown => {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
};
