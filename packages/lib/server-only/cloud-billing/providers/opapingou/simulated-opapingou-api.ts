import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { signOpapingouWebhookBody } from './opapingou-webhook';

/**
 * Simulated Opa Pingou API, for tests only.
 *
 * It implements the charge routes of the provider's REST reference (`/v1/charges`,
 * see `opapingou-client.ts`) and signs webhooks as the provider documents (see
 * `opapingou-webhook.ts`). It listens on 127.0.0.1 only and never reaches the real API.
 */
export const SIMULATED_OPAPINGOU_API_KEY = 'simulated-api-key';
export const SIMULATED_OPAPINGOU_WEBHOOK_SECRET = 'simulated-webhook-secret';

export type TSimulatedRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

export type TSimulatedResponse = {
  status: number;
  body: string;
  delayMs?: number;
  headers?: Record<string, string>;
};

export type TSimulatedChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED';

type TSimulatedCharge = {
  id: string;
  amountCents: number;
  description: string | null;
  validity: string;
  kind: string;
  status: TSimulatedChargeStatus;
  paidAt: string | null;
  createdAt: string;
};

export type StartSimulatedOpapingouApiOptions = {
  apiKey?: string;
  webhookSecret?: string;
};

const SIMULATED_EXPIRES_AT = '2026-10-16T12:00:00.000Z';

export const startSimulatedOpapingouApi = async ({
  apiKey = SIMULATED_OPAPINGOU_API_KEY,
  webhookSecret = SIMULATED_OPAPINGOU_WEBHOOK_SECRET,
}: StartSimulatedOpapingouApiOptions = {}) => {
  const requests: TSimulatedRequest[] = [];

  const charges = new Map<string, TSimulatedCharge>();

  // Charges created with an `Idempotency-Key`, by key.
  const idempotentCharges = new Map<string, string>();

  let nextResponse: TSimulatedResponse | null = null;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');

      requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
        body,
      });

      const response = nextResponse ?? buildDefaultResponse({ req, body, apiKey, charges, idempotentCharges });

      nextResponse = null;

      setTimeout(() => {
        res.writeHead(response.status, { 'content-type': 'application/json', ...response.headers });
        res.end(response.body);
      }, response.delayMs ?? 0);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    setNextResponse: (response: TSimulatedResponse) => {
      nextResponse = response;
    },
    /**
     * Changes a charge the way the provider would after the payer acts on it.
     */
    updateCharge: (
      id: string,
      update: { status?: TSimulatedChargeStatus; amountCents?: number; paidAt?: string | null },
    ) => {
      const charge = charges.get(id);

      if (!charge) {
        throw new Error(`Unknown simulated charge ${id}`);
      }

      const { status = charge.status, amountCents = charge.amountCents } = update;

      const defaultPaidAt = status === 'PAID' ? new Date().toISOString() : charge.paidAt;

      charges.set(id, {
        ...charge,
        status,
        amountCents,
        paidAt: update.paidAt !== undefined ? update.paidAt : defaultPaidAt,
      });
    },
    /**
     * A delivery signed as the provider does (`Opa-Signature`, see `opapingou-webhook.ts`),
     * with `Opa-Event-Id` and `Opa-Event-Type` taken from the event.
     * `timestamp` is in Unix seconds and defaults to the current time.
     */
    buildSignedWebhook: (event: Record<string, unknown>, { timestamp }: { timestamp?: number } = {}) => {
      const rawBody = JSON.stringify(event);

      const signature = signOpapingouWebhookBody({
        rawBody,
        secret: webhookSecret,
        timestamp: timestamp ?? Math.floor(Date.now() / 1000),
      });

      const eventId = typeof event.id === 'string' ? event.id : undefined;
      const eventType = typeof event.type === 'string' ? event.type : undefined;

      return {
        rawBody,
        signature,
        eventId,
        eventType,
        headers: {
          'opa-signature': signature,
          ...(eventId ? { 'opa-event-id': eventId } : {}),
          ...(eventType ? { 'opa-event-type': eventType } : {}),
        },
      };
    },
    close: async () => {
      server.closeAllConnections();

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
};

export type TSimulatedOpapingouApi = Awaited<ReturnType<typeof startSimulatedOpapingouApi>>;

type BuildDefaultResponseOptions = {
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> };
  body: string;
  apiKey: string;
  charges: Map<string, TSimulatedCharge>;
  idempotentCharges: Map<string, string>;
};

const CHARGE_PATH_REGEX = /^\/v1\/charges\/([^/?]+)$/;

const buildDefaultResponse = ({
  req,
  body,
  apiKey,
  charges,
  idempotentCharges,
}: BuildDefaultResponseOptions): TSimulatedResponse => {
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    return problem(401, 'Unauthorized');
  }

  if (req.method === 'POST' && req.url === '/v1/charges') {
    return createCharge({ req, body, charges, idempotentCharges });
  }

  const match = req.method === 'GET' ? CHARGE_PATH_REGEX.exec(req.url ?? '') : null;

  if (match) {
    const charge = charges.get(decodeURIComponent(match[1]));

    return charge ? { status: 200, body: JSON.stringify(serialiseCharge(charge)) } : problem(404, 'Not Found');
  }

  return problem(404, 'Not Found');
};

type CreateChargeOptions = Omit<BuildDefaultResponseOptions, 'apiKey'>;

const createCharge = ({ req, body, charges, idempotentCharges }: CreateChargeOptions): TSimulatedResponse => {
  const input = parseJsonObject(body);

  const amountCents = input?.amountCents;
  const validity = input?.validity;

  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return problem(400, 'Bad Request');
  }

  if (typeof validity !== 'string') {
    return problem(400, 'Bad Request');
  }

  const idempotencyKey = req.headers['idempotency-key'];

  if (typeof idempotencyKey === 'string') {
    const existingId = idempotentCharges.get(idempotencyKey);
    const existing = existingId ? charges.get(existingId) : undefined;

    if (existing) {
      return { status: 201, body: JSON.stringify(serialiseCharge(existing)) };
    }
  }

  const charge: TSimulatedCharge = {
    id: randomUUID(),
    amountCents,
    description: typeof input?.description === 'string' ? input.description : null,
    validity,
    kind: typeof input?.kind === 'string' ? input.kind : 'PIX_QR',
    status: 'PENDING',
    paidAt: null,
    createdAt: new Date().toISOString(),
  };

  charges.set(charge.id, charge);

  if (typeof idempotencyKey === 'string') {
    idempotentCharges.set(idempotencyKey, charge.id);
  }

  return { status: 201, body: JSON.stringify(serialiseCharge(charge)) };
};

/**
 * The `Charge` object of the provider's reference.
 */
const serialiseCharge = (charge: TSimulatedCharge) => ({
  id: charge.id,
  bankAccountId: 'simulated-bank-account',
  amountCents: charge.amountCents,
  description: charge.description,
  validity: charge.validity,
  expiresAt: SIMULATED_EXPIRES_AT,
  status: charge.status,
  kind: charge.kind,
  txid: charge.id.replaceAll('-', ''),
  brCode: `00020126SIMULADO${charge.id}`,
  paymentLink: null,
  providerRef: charge.id,
  paymentId: charge.status === 'PAID' ? `payment-${charge.id}` : null,
  feeCents: 0,
  feeAvoidedCents: 0,
  routingReason: 'simulado',
  paidAt: charge.paidAt,
  createdAt: charge.createdAt,
});

const problem = (status: number, title: string): TSimulatedResponse => ({
  status,
  body: JSON.stringify({ type: 'about:blank', title, status, detail: 'detalhe-interno-do-provedor' }),
  headers: { 'content-type': 'application/problem+json' },
});

const parseJsonObject = (body: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(body);

    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
