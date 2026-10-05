import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, mailer } = vi.hoisted(() => ({
  prisma: {
    cloudSubscriptionCharge: {
      findUniqueOrThrow: vi.fn(),
    },
  },
  mailer: {
    sendMail: vi.fn(),
  },
}));

vi.mock('@documenso/prisma', () => ({ prisma }));
vi.mock('@documenso/email/mailer', () => ({ mailer }));

import type { JobRunIO } from '../../client/_internal/job';
import { run } from './send-cloud-billing-payment-reversal-alert.handler';

const CHARGE = {
  id: 'charge_1',
  amountCents: 100,
  currency: 'BRL',
  providerChargeId: 'opa-charge-1',
  paidAt: new Date('2026-10-05T12:00:00.000Z'),
  periodStart: new Date('2026-10-05T12:00:00.000Z'),
  periodEnd: new Date('2026-11-05T12:00:00.000Z'),
  organisation: { id: 'org_1', name: 'Acme <Ltda>', url: 'acme' },
  coupon: { code: 'PRIMEIRA' },
};

const PAYLOAD = {
  eventId: 'evt_1',
  eventType: 'payment.refunded',
  chargeId: 'charge_1',
  providerPaymentId: 'opa-payment-1',
  paymentAmountCents: 100,
};

const io: JobRunIO = {
  runTask: async (_key, callback) => callback(),
  triggerJob: vi.fn(),
  wait: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
};

describe('send.cloud-billing.payment-reversal.alert handler', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', 'https://docverse.example');
    vi.stubEnv('NEXT_PRIVATE_CLOUD_BILLING_ALERT_EMAIL', 'alertas@exemplo.com');
    vi.stubEnv('NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL', 'lista@exemplo.com');

    prisma.cloudSubscriptionCharge.findUniqueOrThrow.mockResolvedValue(CHARGE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('emails the team with the organisation, the payment and the charge', async () => {
    await run({ payload: PAYLOAD, io });

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);

    const [mail] = mailer.sendMail.mock.calls[0];

    expect(mail.to).toEqual({ address: 'alertas@exemplo.com', name: '' });
    expect(mail.subject).toBe('[Docverse] Pagamento estornado: Acme <Ltda> (R$ 1,00)');
    expect(mail.text).toContain('Organização: Acme <Ltda> (acme)');
    expect(mail.text).toContain('Admin: https://docverse.example/admin/organisations/org_1');
    expect(mail.text).toContain('Pagamento Opa Pingou: opa-payment-1');
    expect(mail.text).toContain('Cupom: PRIMEIRA');
    expect(mail.text).toContain('A assinatura não foi alterada');
    expect(mail.html).toContain('Acme &lt;Ltda&gt;');
    expect(mail.html).not.toContain('<Ltda>');
  });

  it('names a chargeback as such', async () => {
    await run({ payload: { ...PAYLOAD, eventType: 'payment.charged_back' }, io });

    expect(mailer.sendMail.mock.calls[0][0].subject).toContain('Pagamento contestado (chargeback)');
  });

  it('falls back to the waitlist notice address', async () => {
    vi.stubEnv('NEXT_PRIVATE_CLOUD_BILLING_ALERT_EMAIL', '');

    await run({ payload: PAYLOAD, io });

    expect(mailer.sendMail.mock.calls[0][0].to.address).toBe('lista@exemplo.com');
  });

  it('logs an error and sends nothing without an address', async () => {
    vi.stubEnv('NEXT_PRIVATE_CLOUD_BILLING_ALERT_EMAIL', '');
    vi.stubEnv('NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL', '');

    await run({ payload: PAYLOAD, io });

    expect(mailer.sendMail).not.toHaveBeenCalled();
    expect(io.logger.error).toHaveBeenCalled();
  });
});
