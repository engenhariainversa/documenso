import { env } from '@documenso/lib/utils/env';

import { APP_NAME } from './brand';

export const APP_DOCUMENT_UPLOAD_SIZE_LIMIT = Number(env('NEXT_PUBLIC_DOCUMENT_SIZE_UPLOAD_LIMIT')) || 50;

export const NEXT_PUBLIC_WEBAPP_URL = () => env('NEXT_PUBLIC_WEBAPP_URL') ?? 'http://localhost:3000';

/**
 * The sub-path the app is served under (no trailing slash), e.g. "/ESign".
 * Returns an empty string when served at root.
 *
 * Prefers the explicit NEXT_PUBLIC_BASE_PATH (which is the same value baked
 * into the Vite/React Router build). Falls back to the pathname of
 * NEXT_PUBLIC_WEBAPP_URL so the function still works in dev when the env
 * variable is unset.
 *
 * Avoid using this to build URLs, use {@link formatPath} instead. Reserve this
 * for cases where the raw prefix itself is needed, such as path comparisons.
 */
export const getBasePath = (): string => {
  const explicit = env('NEXT_PUBLIC_BASE_PATH');

  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  try {
    return new URL(NEXT_PUBLIC_WEBAPP_URL()).pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
};

/**
 * Prefix a root-relative path with the app's base path.
 *
 * `formatPath('/api/trpc')` -> `/ESign/api/trpc` under sub-path hosting,
 * `/api/trpc` otherwise.
 */
export const formatPath = (path: string): string => {
  return `${getBasePath()}${path}`;
};

export const NEXT_PUBLIC_SIGNING_CONTACT_INFO = () =>
  env('NEXT_PUBLIC_SIGNING_CONTACT_INFO') ?? NEXT_PUBLIC_WEBAPP_URL();

export const NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER = () =>
  env('NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER') === 'true';

export const NEXT_PRIVATE_INTERNAL_WEBAPP_URL = () =>
  env('NEXT_PRIVATE_INTERNAL_WEBAPP_URL') ?? NEXT_PUBLIC_WEBAPP_URL();

/**
 * Docverse has no billing. Kept as a function so upstream call sites stay untouched.
 */
export const IS_BILLING_ENABLED = () => false;

/**
 * Whether this instance is Docverse Cloud (managed SaaS).
 *
 * Used so we can show a different UI for Docverse Cloud and self-hosted instances since
 * there are things like billing, upsells, documenso links, etc that don't make sense for self-hosted instances.
 */
export const IS_DOCUMENSO_CLOUD = () => env('NEXT_PUBLIC_IS_DOCUMENSO_CLOUD') === 'true';

export const API_V2_BETA_URL = '/api/v2-beta';
export const API_V2_URL = '/api/v2';

export const SUPPORT_EMAIL = env('NEXT_PUBLIC_SUPPORT_EMAIL') ?? 'support@documenso.com';

export const USE_INTERNAL_URL_BROWSERLESS = () => env('NEXT_PUBLIC_USE_INTERNAL_URL_BROWSERLESS') === 'true';

/**
 * Returns whether AI features are configured for this instance.
 *
 * Platform-aware:
 * - On the server, checks the private Vertex credentials are configured.
 * - On the client, reads the derived public flag injected via `window.__ENV__`.
 */
export const IS_AI_FEATURES_CONFIGURED = (): boolean => {
  if (typeof window === 'undefined') {
    return !!env('GOOGLE_VERTEX_PROJECT_ID') && !!env('GOOGLE_VERTEX_API_KEY');
  }

  return env('NEXT_PUBLIC_AI_FEATURES_ENABLED') === 'true';
};

/**
 * Temporary flag to toggle between Playwright-based and Konva-based PDF generation
 * for audit logs during sealing.
 *
 * @deprecated This is a temporary flag and will be removed once Konva-based generation is stable.
 */
export const NEXT_PRIVATE_USE_PLAYWRIGHT_PDF = () => env('NEXT_PRIVATE_USE_PLAYWRIGHT_PDF') === 'true';

export const NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY = () => env('NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY');
export const NEXT_PRIVATE_SIGNING_REASON = () => env('NEXT_PRIVATE_SIGNING_REASON') || `Signed by ${APP_NAME}`;

export const NEXT_PRIVATE_SIGNING_TRANSPORT = () => env('NEXT_PRIVATE_SIGNING_TRANSPORT') || 'local';

/**
 * Whether this Docverse instance is running in CSC (Cloud Signature Consortium) mode.
 *
 * CSC (remote TSP-backed AES/QES) signing was removed in this fork — every
 * envelope now signs through the normal SES flow (see `signPdf` from
 * `@documenso/signing`). Kept as a function (always `false`) rather than
 * deleted outright so call sites that still branch on instance mode don't
 * need to change; a future ICP-Brasil qualified-signature mode will replace
 * this.
 */
export const IS_INSTANCE_CSC_MODE = (): boolean => false;

export const DOCUMENSO_CLOUD_ENTERPRISE_CTA_URL = 'https://documen.so/enterprise-cta';
