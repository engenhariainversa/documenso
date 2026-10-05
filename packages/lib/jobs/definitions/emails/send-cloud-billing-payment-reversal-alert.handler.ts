import { mailer } from '@documenso/email/mailer';
import { prisma } from '@documenso/prisma';

import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { CLOUD_BILLING_ALERT_EMAIL } from '../../../constants/cloud-billing';
import { DOCUMENSO_INTERNAL_EMAIL } from '../../../constants/email';
import { formatCentsAsCurrency } from '../../../universal/cloud-billing/money';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendCloudBillingPaymentReversalAlertJobDefinition } from './send-cloud-billing-payment-reversal-alert';

const EVENT_LABELS: Record<string, string> = {
  'payment.refunded': 'Pagamento estornado',
  'payment.charged_back': 'Pagamento contestado (chargeback)',
};

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * Tells the team that a payment of a Docverse Cloud charge was refunded or charged
 * back. Internal, in pt-BR, plain: it goes to `CLOUD_BILLING_ALERT_EMAIL()`.
 *
 * Nothing else happens for now: the subscription the payment bought stays as it is
 * until someone acts. Cancelling it automatically is planned.
 */
export const run = async ({
  payload,
  io,
}: {
  payload: TSendCloudBillingPaymentReversalAlertJobDefinition;
  io: JobRunIO;
}) => {
  const alertEmail = CLOUD_BILLING_ALERT_EMAIL();

  if (!alertEmail) {
    io.logger.error(
      `${payload.eventType} for charge ${payload.chargeId}: no alert email configured (NEXT_PRIVATE_CLOUD_BILLING_ALERT_EMAIL)`,
    );

    return;
  }

  const charge = await prisma.cloudSubscriptionCharge.findUniqueOrThrow({
    where: { id: payload.chargeId },
    include: {
      organisation: { select: { id: true, name: true, url: true } },
      coupon: { select: { code: true } },
    },
  });

  const label = EVENT_LABELS[payload.eventType] ?? payload.eventType;

  const amount = formatCentsAsCurrency({
    cents: payload.paymentAmountCents ?? charge.amountCents,
    currency: charge.currency,
  });

  const baseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';

  const lines: [string, string][] = [
    ['Evento', `${label} (${payload.eventType})`],
    ['Organização', `${charge.organisation.name} (${charge.organisation.url})`],
    ['Admin', `${baseUrl}/admin/organisations/${charge.organisation.id}`],
    ['Valor do pagamento', amount],
    ['Cobrança Docverse', charge.id],
    ['Cobrança Opa Pingou', charge.providerChargeId ?? '-'],
    ['Pagamento Opa Pingou', payload.providerPaymentId ?? '-'],
    ['Pago em', charge.paidAt?.toISOString() ?? '-'],
    [
      'Período comprado',
      charge.periodStart && charge.periodEnd
        ? `${charge.periodStart.toISOString()} a ${charge.periodEnd.toISOString()}`
        : '-',
    ],
    ['Cupom', charge.coupon?.code ?? '-'],
    ['Evento Opa Pingou', payload.eventId],
  ];

  const note =
    'A assinatura não foi alterada. Por enquanto, decida manualmente o que fazer com ela; o cancelamento automático em estorno e chargeback está planejado.';

  const text = [`${label} no Docverse Cloud`, '', ...lines.map(([key, value]) => `${key}: ${value}`), '', note].join(
    '\n',
  );

  const html = [
    `<h2>${escapeHtml(label)} no Docverse Cloud</h2>`,
    '<table cellpadding="4">',
    ...lines.map(
      ([key, value]) => `<tr><td><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(value)}</td></tr>`,
    ),
    '</table>',
    `<p>${escapeHtml(note)}</p>`,
  ].join('\n');

  await io.runTask('send-payment-reversal-alert', async () => {
    await mailer.sendMail({
      to: { address: alertEmail, name: '' },
      from: DOCUMENSO_INTERNAL_EMAIL,
      subject: `[Docverse] ${label}: ${charge.organisation.name} (${amount})`,
      html,
      text,
    });
  });
};
