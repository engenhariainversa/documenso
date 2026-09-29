import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Simulated Opa Pingou API, for tests only.
 *
 * It implements the contract the adapter ASSUMES (see the spec), since the provider
 * publishes no API reference. It listens on 127.0.0.1 only and never reaches the
 * real API.
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

export type StartSimulatedOpapingouApiOptions = {
  apiKey?: string;
  webhookSecret?: string;
};

export const startSimulatedOpapingouApi = async ({
  apiKey = SIMULATED_OPAPINGOU_API_KEY,
  webhookSecret = SIMULATED_OPAPINGOU_WEBHOOK_SECRET,
}: StartSimulatedOpapingouApiOptions = {}) => {
  const requests: TSimulatedRequest[] = [];

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

      const response = nextResponse ?? buildDefaultResponse({ req, body, apiKey });

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
    buildSignedWebhook: (event: Record<string, unknown>) => {
      const rawBody = JSON.stringify(event);

      const signature = createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');

      return {
        rawBody,
        signature,
        headers: { 'x-opapingou-signature': signature },
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
};

const buildDefaultResponse = ({ req, body, apiKey }: BuildDefaultResponseOptions): TSimulatedResponse => {
  if (req.method !== 'POST' || req.url !== '/v1/cobranca') {
    return { status: 404, body: JSON.stringify({ erro: 'nao_encontrado' }) };
  }

  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    return { status: 401, body: JSON.stringify({ erro: 'nao_autorizado' }) };
  }

  const params = new URLSearchParams(body);

  if (!params.get('valor')) {
    return { status: 422, body: JSON.stringify({ erro: 'valor_obrigatorio' }) };
  }

  const id = `cob_${randomUUID()}`;

  return {
    status: 201,
    body: JSON.stringify({
      id,
      status: 'pendente',
      valor: params.get('valor'),
      referencia: params.get('referencia'),
      url_pagamento: `https://pagamento.invalid/${id}`,
      pix_copia_e_cola: `00020126SIMULADO${id}`,
      expira_em: '2026-10-16T12:00:00.000Z',
    }),
  };
};
