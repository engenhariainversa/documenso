import { IS_CLOUD_BILLING_ENABLED } from '@documenso/lib/constants/cloud-billing';
import {
  CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES,
  handleOpapingouWebhook,
} from '@documenso/lib/server-only/cloud-billing/handle-webhook';
import {
  OPAPINGOU_EVENT_ID_HEADER,
  OPAPINGOU_EVENT_TYPE_HEADER,
  OPAPINGOU_SIGNATURE_HEADER,
} from '@documenso/lib/server-only/cloud-billing/providers/opapingou/opapingou-webhook';
import { readRequestBodyWithLimit } from '@documenso/lib/server-only/cloud-billing/read-request-body';
import { createRateLimitMiddleware } from '@documenso/lib/server-only/rate-limit/rate-limit-middleware';
import { cloudBillingWebhookRateLimit } from '@documenso/lib/server-only/rate-limit/rate-limits';
import { Hono } from 'hono';

import type { HonoEnv } from '../../router';

const rateLimitMiddleware = createRateLimitMiddleware(cloudBillingWebhookRateLimit);

/**
 * Payment provider webhooks for Docverse Cloud billing.
 *
 * All the logic lives in `handleOpapingouWebhook`. This route only hands it the raw
 * body and the `Opa-*` headers, and logs the outcome. The body, the signature and the
 * secret are never logged.
 */
export const billingWebhookRoute = new Hono<HonoEnv>()
  .use(async (c, next) => {
    // Answer before the rate limiter, so a disabled instance never touches the database.
    if (!IS_CLOUD_BILLING_ENABLED()) {
      return c.json({ error: 'Not found' }, 404);
    }

    await next();
  })
  .use(rateLimitMiddleware)
  .post('/webhook', async (c) => {
    const logger = c.get('logger');

    try {
      // Read from the stream with a cap: a body sent without a declared length
      // must not be held in memory beyond the limit.
      const rawBody = await readRequestBodyWithLimit({
        request: c.req.raw,
        maxBytes: CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES,
      });

      if (rawBody === null) {
        logger.info({ outcome: 'BODY_TOO_LARGE' }, 'Cloud billing webhook handled');

        return c.json({ outcome: 'BODY_TOO_LARGE' }, 413);
      }

      const { status, outcome, eventId, chargeId } = await handleOpapingouWebhook({
        rawBody,
        signature: c.req.header(OPAPINGOU_SIGNATURE_HEADER),
        eventIdHeader: c.req.header(OPAPINGOU_EVENT_ID_HEADER),
        eventTypeHeader: c.req.header(OPAPINGOU_EVENT_TYPE_HEADER),
      });

      logger.info({ outcome, eventId, chargeId }, 'Cloud billing webhook handled');

      return c.json({ outcome }, status);
    } catch (err) {
      // Only the error name is logged: the error itself can carry request data.
      logger.error({ errorName: err instanceof Error ? err.name : 'unknown' }, 'Cloud billing webhook failed');

      // A 5xx makes the provider deliver the event again.
      return c.json({ error: 'Internal error' }, 500);
    }
  });
