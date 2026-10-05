import { env } from '../utils/env';

/**
 * Docverse Cloud billing.
 *
 * Self-hosted instances never enable this: billing is off unless
 * NEXT_PUBLIC_CLOUD_BILLING_ENABLED is exactly "true".
 *
 * This is intentionally separate from the upstream IS_BILLING_ENABLED flag, which
 * stays off because it drives plan gates that assume the removed Stripe plans.
 */
export const CLOUD_BILLING_PROVIDER = 'opapingou';

export const CLOUD_SUBSCRIPTION_PRICE_CENTS = 9990;

export const CLOUD_SUBSCRIPTION_CURRENCY = 'BRL';

/**
 * How long an organisation can keep sending documents after its paid period ended.
 *
 * Renewal is a manual Pix payment, so without a grace period the service would stop
 * at the exact minute the period ends.
 */
export const CLOUD_SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

/**
 * How long a pending charge is handed back to the user instead of creating a new one.
 */
export const CLOUD_CHECKOUT_REUSE_WINDOW_HOURS = 24;

export const OPAPINGOU_DEFAULT_API_URL = 'https://api.opapingou.com.br/v1';

export const IS_CLOUD_BILLING_ENABLED = () => env('NEXT_PUBLIC_CLOUD_BILLING_ENABLED') === 'true';

/**
 * The REST API lives under `/v1`. A URL configured without it (only the host) gets it
 * appended, so the charge routes never land on `/charges` and answer 404.
 */
export const OPAPINGOU_API_URL = () => {
  const url = (readOptionalEnv('NEXT_PRIVATE_OPAPINGOU_API_URL') ?? OPAPINGOU_DEFAULT_API_URL).replace(/\/+$/, '');

  return url.endsWith('/v1') ? url : `${url}/v1`;
};

export const OPAPINGOU_API_KEY = () => readOptionalEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY');

export const OPAPINGOU_WEBHOOK_SECRET = () => readOptionalEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET');

export const IS_CLOUD_BILLING_PROVIDER_CONFIGURED = () =>
  OPAPINGOU_API_KEY() !== undefined && OPAPINGOU_WEBHOOK_SECRET() !== undefined;

const readOptionalEnv = (key: string) => {
  const value = env(key)?.trim();

  if (!value) {
    return undefined;
  }

  return value;
};
