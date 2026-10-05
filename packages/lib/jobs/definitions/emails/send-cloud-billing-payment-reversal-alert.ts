import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_ID = 'send.cloud-billing.payment-reversal.alert';

const SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_SCHEMA = z.object({
  eventId: z.string(),
  eventType: z.string(),
  chargeId: z.string(),
  providerPaymentId: z.string().nullable(),
  paymentAmountCents: z.number().nullable(),
});

export type TSendCloudBillingPaymentReversalAlertJobDefinition = z.infer<
  typeof SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_SCHEMA
>;

export const SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION = {
  id: SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_ID,
  name: 'Send Cloud Billing Payment Reversal Alert',
  version: '1.0.0',
  trigger: {
    name: SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_ID,
    schema: SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./send-cloud-billing-payment-reversal-alert.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof SEND_CLOUD_BILLING_PAYMENT_REVERSAL_ALERT_JOB_DEFINITION_ID,
  TSendCloudBillingPaymentReversalAlertJobDefinition
>;
