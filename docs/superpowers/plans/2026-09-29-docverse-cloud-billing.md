# Cobrança da versão cloud — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar pronto, e desligado por padrão, o checkout da assinatura cloud do Docverse (R$ 99,90 por mês, por organização) usando a API do Opa Pingou.

**Architecture:** O ciclo mensal é controlado pelo Docverse: cada mês é uma cobrança Pix avulsa no provedor, e o webhook de pagamento estende o período da organização. O estado da assinatura é derivado da data de fim do período por uma função pura, compartilhada entre servidor e navegador. Tudo que depende do formato da API do provedor fica isolado em dois arquivos.

**Tech Stack:** TypeScript, Prisma + Postgres, tRPC, Hono, React Router 7, Lingui, Zod, Luxon, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-docverse-cloud-billing-design.md`

## Global Constraints

- Nenhum merge, nenhum push na `main`. Nada em produção: sem tocar em `.env.prod`, containers de produção, banco ou proxy.
- Não criar conta nem plano no Opa Pingou, não chamar a API real. Testes só contra API simulada em `127.0.0.1`.
- Código novo, sem ler `packages/ee` nem o billing antigo do histórico git.
- Credenciais só por variável de ambiente, documentadas sem valor no `.env.example`. Sem segredo em log.
- `IS_BILLING_ENABLED()` continua devolvendo `false`. A flag nova é `IS_CLOUD_BILLING_ENABLED()`.
- Preço: `9990` centavos, moeda `BRL`. Tolerância: `3` dias. Reaproveitamento de cobrança pendente: `24` horas.
- Estilo (AGENTS.md): `type` em vez de `interface`, arrow functions, named exports, sem classes, sem `if` de uma linha, `AppError` para erros.
- Nesta máquina (Ubuntu 26.04) o `npm ci` exige `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. E2E com Playwright não roda aqui.
- Containers descartáveis usam prefixo `test-` e são removidos pelo nome explícito, com `docker rm -f -v`.

## Review Focus

1. **Webhook reentregue ou duplicado em paralelo:** o período só pode ser estendido uma vez por pagamento. Teste em `handle-webhook.integration.test.ts` (Task 7).
2. **Webhook forjado:** assinatura ausente, errada, de tamanho diferente, ou segredo não configurado devem dar 401 sem gravar nada. Teste em `opapingou-webhook.test.ts` (Task 5) e no handler (Task 7).
3. **Valor pago diferente do cobrado:** não ativa a assinatura. Teste no handler (Task 7).
4. **Clique duplo em "Assinar":** devolve a mesma cobrança pendente, sem criar outra no provedor. Teste em `create-checkout.integration.test.ts` (Task 6).
5. **Cobrança desligada:** nenhum caminho de envio consulta o banco nem bloqueia. Teste em `subscription-state.test.ts` (Task 2) e `assert-organisation-can-send.test.ts` (Task 8).

---

## Estrutura de arquivos

Novos:

| Arquivo | Responsabilidade |
|---|---|
| `packages/lib/constants/cloud-billing.ts` | flag, preço, tolerância, leitura das variáveis do provedor |
| `packages/lib/universal/cloud-billing/subscription-state.ts` | estado derivado e cálculo do período (puro) |
| `packages/lib/universal/cloud-billing/money.ts` | centavos ↔ decimal em reais (puro) |
| `packages/lib/server-only/cloud-billing/providers/opapingou/opapingou-client.ts` | criar cobrança no provedor |
| `packages/lib/server-only/cloud-billing/providers/opapingou/opapingou-webhook.ts` | verificar assinatura e ler evento |
| `packages/lib/server-only/cloud-billing/providers/opapingou/simulated-opapingou-api.ts` | API simulada para os testes |
| `packages/lib/server-only/cloud-billing/create-checkout.ts` | início do checkout |
| `packages/lib/server-only/cloud-billing/get-cloud-subscription.ts` | leitura do estado para a tela |
| `packages/lib/server-only/cloud-billing/handle-webhook.ts` | processamento idempotente do webhook |
| `packages/lib/server-only/cloud-billing/assert-organisation-can-send.ts` | trava de envio |
| `packages/lib/server-only/cloud-billing/test-database.ts` | apoio dos testes de integração |
| `packages/trpc/server/billing-router/*` | rotas `getSubscription` e `createCheckout` |
| `apps/remix/server/api/billing/webhook.ts` | rota Hono do webhook |
| `apps/remix/app/routes/_authenticated+/o.$orgUrl.settings.billing.tsx` | tela de plano |
| `apps/remix/app/components/general/cloud-billing/cloud-subscription-banner.tsx` | faixa de aviso |
| `packages/prisma/migrations/20260929120000_add_cloud_billing/migration.sql` | migração |

Modificados (inserções pequenas): `packages/prisma/schema.prisma`, `packages/lib/server-only/limits/get-server-limits.ts`, `packages/lib/client-only/providers/limits.tsx`, `packages/lib/server-only/document/send-document.ts`, `packages/lib/server-only/document/resend-document.ts`, `packages/lib/server-only/template/create-document-from-direct-template.ts`, `packages/lib/utils/settings-nav.ts`, `packages/lib/server-only/rate-limit/rate-limits.ts`, `packages/trpc/server/router.ts`, `packages/trpc/server/organisation-router/get-organisation-session.ts` e `.types.ts`, `apps/remix/server/router.ts`, `apps/remix/app/routes/_authenticated+/_layout.tsx`, `apps/remix/app/routes/_authenticated+/t.$teamUrl+/_layout.tsx`, `apps/remix/app/utils/toast-error-messages.ts`, `.env.example`, `turbo.json`, `packages/tsconfig/process-env.d.ts`, `packages/lib/translations/pt-BR/web.po`.

---

### Task 1: Constantes e conversão de valores

**Files:**
- Create: `packages/lib/constants/cloud-billing.ts`, `packages/lib/constants/cloud-billing.test.ts`
- Create: `packages/lib/universal/cloud-billing/money.ts`, `packages/lib/universal/cloud-billing/money.test.ts`

**Interfaces — Produces:**

```ts
// constants/cloud-billing.ts
export const CLOUD_BILLING_PROVIDER = 'opapingou';
export const CLOUD_SUBSCRIPTION_PRICE_CENTS = 9990;
export const CLOUD_SUBSCRIPTION_CURRENCY = 'BRL';
export const CLOUD_SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;
export const CLOUD_CHECKOUT_REUSE_WINDOW_HOURS = 24;
export const OPAPINGOU_DEFAULT_API_URL = 'https://api.opapingou.com.br/v1';
export const IS_CLOUD_BILLING_ENABLED: () => boolean;
export const OPAPINGOU_API_URL: () => string;            // sem barra no fim
export const OPAPINGOU_API_KEY: () => string | undefined; // vazio vira undefined
export const OPAPINGOU_WEBHOOK_SECRET: () => string | undefined;
export const IS_CLOUD_BILLING_PROVIDER_CONFIGURED: () => boolean; // chave e segredo presentes

// universal/cloud-billing/money.ts
export const formatCentsAsDecimal: (cents: number) => string;        // 9990 -> "99.90"
export const parseDecimalToCents: (value: string | number) => number | null; // "99.90" -> 9990
```

- [ ] **Step 1: Testes que falham.** Casos de `cloud-billing.test.ts`, com `vi.stubEnv` e `vi.unstubAllEnvs()` no `afterEach`:
  - desligada quando a variável está indefinida, vazia, `"false"` ou `"1"`; ligada só com `"true"`;
  - `OPAPINGOU_API_URL()` devolve o padrão sem a variável e remove a barra final quando definida;
  - `OPAPINGOU_API_KEY()` devolve `undefined` para string vazia ou só espaços;
  - `IS_CLOUD_BILLING_PROVIDER_CONFIGURED()` é `false` se faltar a chave ou o segredo.

  Casos de `money.test.ts`: `9990 → "99.90"`, `5 → "0.05"`, `100000 → "1000.00"`; `"99.90" → 9990`, `99.9 → 9990`, `"350.00" → 35000`, `"0.29" → 29` (não `28`), e `null` para `"abc"`, `""`, `"-1"`, `"1.999"`, `NaN`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run constants/cloud-billing.test.ts universal/cloud-billing/money.test.ts` em `packages/lib`. Esperado: falha de importação.
- [ ] **Step 3: Implementar.** `parseDecimalToCents` valida com a expressão `^\d+(\.\d{1,2})?$` sobre a string e monta os centavos a partir das partes inteira e decimal, sem multiplicar ponto flutuante.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(billing): constantes e conversão de valores da cobrança cloud`.

### Task 2: Estado da assinatura

**Files:**
- Create: `packages/lib/universal/cloud-billing/subscription-state.ts`, `subscription-state.test.ts`

**Interfaces — Produces:**

```ts
export type TCloudSubscriptionState = 'DISABLED' | 'NONE' | 'ACTIVE' | 'GRACE' | 'EXPIRED';

export const getCloudSubscriptionState: (options: {
  isBillingEnabled: boolean;
  currentPeriodEnd: Date | null | undefined;
  now?: Date;
}) => TCloudSubscriptionState;

export const isSendingAllowedForState: (state: TCloudSubscriptionState) => boolean;

export const computeNextPeriod: (options: {
  now: Date;
  currentPeriodEnd: Date | null | undefined;
}) => { periodStart: Date; periodEnd: Date };
```

- [ ] **Step 1: Testes que falham.** Com `now = 2026-10-15T12:00:00Z`:
  - cobrança desligada → `DISABLED`, mesmo com período vencido;
  - sem período → `NONE`;
  - fim em `2026-10-16` → `ACTIVE`; fim exatamente igual a `now` → `GRACE`;
  - fim em `2026-10-13` → `GRACE`; fim em `2026-10-12T12:00:00Z` (exatos 3 dias) → `EXPIRED`;
  - `isSendingAllowedForState`: `true` para `DISABLED`, `ACTIVE`, `GRACE`; `false` para `NONE`, `EXPIRED`;
  - `computeNextPeriod` sem período: começa em `now`, termina um mês depois;
  - com período ainda válido (fim `2026-10-20`): começa em `2026-10-20`, termina `2026-11-20`;
  - com período vencido: começa em `now`;
  - de `2027-01-31`: termina `2027-02-28` (o mês curto não estoura).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** com Luxon em UTC (`DateTime.fromJSDate(d, { zone: 'utc' }).plus({ months: 1 })`).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(billing): estado derivado da assinatura cloud`.

### Task 3: Modelo de dados e migração

**Files:**
- Modify: `packages/prisma/schema.prisma` (três modelos novos, um enum, dois campos de relação em `Organisation`)
- Create: `packages/prisma/migrations/20260929120000_add_cloud_billing/migration.sql`

- [ ] **Step 1: Editar o schema** com os modelos da seção 2 da spec.
- [ ] **Step 2: Subir Postgres descartável.**

```bash
docker run -d --rm --name test-docverse-billing-db \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=docverse_test \
  -p 127.0.0.1:54399:5432 postgres:15
```

- [ ] **Step 3: Gerar o SQL** aplicando as migrações existentes e pedindo a diferença para o schema:

```bash
export NEXT_PRIVATE_DATABASE_URL="postgresql://postgres:test@127.0.0.1:54399/docverse_test"
export NEXT_PRIVATE_DIRECT_DATABASE_URL="$NEXT_PRIVATE_DATABASE_URL"
npx prisma migrate deploy --schema packages/prisma/schema.prisma
npx prisma migrate diff --from-url "$NEXT_PRIVATE_DATABASE_URL" \
  --to-schema-datamodel packages/prisma/schema.prisma --script
```

  Conferir que a saída só tem `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` e `ADD CONSTRAINT` das tabelas novas. Gravar em `migration.sql`.
- [ ] **Step 4: Validar.** `prisma migrate deploy` de novo (aplica a nova) e `prisma migrate diff ... --exit-code` deve sair com 0 (schema e migrações iguais). `npx prisma generate`.
- [ ] **Step 5: Commit** `feat(billing): modelo de dados e migração da cobrança cloud`.

### Task 4: Adaptador do Opa Pingou — criar cobrança

**Files:**
- Create: `packages/lib/server-only/cloud-billing/providers/opapingou/opapingou-client.ts`
- Create: `.../opapingou/simulated-opapingou-api.ts`
- Test: `.../opapingou/opapingou-client.test.ts`

**Interfaces — Produces:**

```ts
export type TProviderCharge = {
  providerChargeId: string;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
  expiresAt: Date | null;
};

export const createOpapingouCharge: (options: {
  amountCents: number;
  reference: string;
  description: string;
  timeoutMs?: number; // padrão 10000
}) => Promise<TProviderCharge>;

// simulated-opapingou-api.ts (só para testes)
export const startSimulatedOpapingouApi: (options?: {
  apiKey?: string;
  webhookSecret?: string;
}) => Promise<{
  url: string;                       // http://127.0.0.1:<porta>/v1
  requests: TSimulatedRequest[];     // método, caminho, cabeçalhos, corpo
  setNextResponse: (response: { status: number; body: string; delayMs?: number }) => void;
  buildSignedWebhook: (event: object) => { rawBody: string; headers: Record<string, string> };
  close: () => Promise<void>;
}>;
```

- [ ] **Step 1: Escrever a API simulada** com `node:http`, escutando em `127.0.0.1` porta `0`. Ela responde `POST /v1/cobranca`: 401 sem `Bearer` correto; 422 sem `valor`; senão 201 com `{ id, status: "pendente", url_pagamento, pix_copia_e_cola, expira_em }`.
- [ ] **Step 2: Testes que falham**, com `vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', api.url)`:
  - envia `POST /v1/cobranca`, `Authorization: Bearer <chave>`, `content-type` form-urlencoded, `valor=99.90`, `referencia` e `descricao`;
  - devolve `TProviderCharge` com os quatro campos;
  - aceita resposta sem `url_pagamento`, `pix_copia_e_cola` e `expira_em` (viram `null`);
  - sem chave configurada → `AppError` `NOT_SETUP`, e nenhuma requisição sai;
  - 401 do provedor → `AppError`; a mensagem não contém a chave;
  - 500 do provedor → `AppError`; a mensagem não contém o corpo da resposta;
  - resposta 200 com JSON sem `id` → `AppError`;
  - resposta que não é JSON → `AppError`;
  - provedor demora mais que `timeoutMs` → `AppError`, em menos de 2 s com `timeoutMs: 200`.
- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar** com `fetch` e `AbortSignal.timeout`. Resposta validada com Zod.
- [ ] **Step 5: Rodar e ver passar.**
- [ ] **Step 6: Commit** `feat(billing): adaptador de cobrança do Opa Pingou com API simulada`.

### Task 5: Adaptador do Opa Pingou — webhook

**Files:**
- Create: `.../opapingou/opapingou-webhook.ts`
- Test: `.../opapingou/opapingou-webhook.test.ts`

**Interfaces — Produces:**

```ts
export const OPAPINGOU_SIGNATURE_HEADER = 'x-opapingou-signature';

export const signOpapingouWebhookBody: (options: { rawBody: string; secret: string }) => string;

export const verifyOpapingouWebhookSignature: (options: {
  rawBody: string;
  signature: string | null | undefined;
  secret: string | null | undefined;
}) => boolean;

export type TProviderWebhookEvent = {
  eventId: string;          // id do provedor, ou "sha256:<hash do corpo>"
  eventType: string;
  isPayment: boolean;
  providerChargeId: string | null;
  reference: string | null;
  amountCents: number | null;
};

export const parseOpapingouWebhookEvent: (rawBody: string) => TProviderWebhookEvent | null;
```

- [ ] **Step 1: Testes que falham.**
  - assinatura correta → `true`; com prefixo `sha256=` → `true`; em maiúsculas → `true`;
  - corpo alterado em um caractere → `false`; segredo errado → `false`;
  - assinatura ausente, vazia, de tamanho diferente ou não hexadecimal → `false`, sem lançar;
  - segredo `undefined` ou vazio → `false`, mesmo com assinatura "válida" para segredo vazio;
  - evento `pingou` completo → `isPayment: true`, `amountCents: 9990`;
  - `valor` numérico `99.9` → `9990`;
  - evento sem `id` → `eventId` começa com `sha256:` e é igual para o mesmo corpo;
  - evento de outro tipo → `isPayment: false`;
  - JSON inválido, array, `null` ou objeto sem `evento` → `null`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** com `createHmac('sha256', secret)` e `timingSafeEqual` sobre buffers de mesmo tamanho.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(billing): verificação e leitura do webhook do Opa Pingou`.

### Task 6: Início do checkout

**Files:**
- Create: `packages/lib/server-only/cloud-billing/create-checkout.ts`, `get-cloud-subscription.ts`, `test-database.ts`
- Test: `packages/lib/server-only/cloud-billing/create-checkout.integration.test.ts`

**Interfaces — Consumes:** `createOpapingouCharge`, constantes da Task 1, estado da Task 2.

**Interfaces — Produces:**

```ts
export type TCloudCheckoutCharge = {
  id: string;
  amountCents: number;
  currency: string;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export const createCloudSubscriptionCheckout: (options: {
  organisationId: string;
  userId: number;
  now?: Date;
}) => Promise<TCloudCheckoutCharge>;

export const getCloudSubscription: (options: { organisationId: string; now?: Date }) => Promise<{
  isBillingEnabled: boolean;
  isProviderConfigured: boolean;
  state: TCloudSubscriptionState;
  isSendingAllowed: boolean;
  priceCents: number;
  currency: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  pendingCharge: TCloudCheckoutCharge | null;
}>;
```

Os testes de integração usam `describe.skipIf(!process.env.CLOUD_BILLING_TEST_DATABASE_URL)`. `test-database.ts` cria a organização mínima (usuário, claim, configurações, portal) e limpa as tabelas de cobrança entre testes.

- [ ] **Step 1: Testes que falham.**
  - cria cobrança `PENDING` de `9990` centavos, com `providerChargeId`, link e código Pix vindos da API simulada; a `referencia` enviada é o id da linha;
  - segunda chamada devolve a mesma cobrança e a API simulada recebeu uma requisição só;
  - cobrança pendente com `expiresAt` no passado vira `EXPIRED` e uma nova é criada;
  - cobrança pendente criada há mais de 24 horas não é reaproveitada;
  - provedor responde 500 → erro, e nenhuma cobrança fica no banco;
  - cobrança desligada → `AppError` `NOT_FOUND`;
  - sem chave → `AppError` `NOT_SETUP`;
  - `getCloudSubscription` devolve `NONE` e a cobrança pendente.
- [ ] **Step 2 a 4:** rodar, implementar, rodar.
- [ ] **Step 5: Commit** `feat(billing): início do checkout da assinatura cloud`.

### Task 7: Webhook

**Files:**
- Create: `packages/lib/server-only/cloud-billing/handle-webhook.ts`
- Create: `apps/remix/server/api/billing/webhook.ts`
- Modify: `apps/remix/server/router.ts`, `packages/lib/server-only/rate-limit/rate-limits.ts`
- Test: `packages/lib/server-only/cloud-billing/handle-webhook.test.ts` (sem banco), `handle-webhook.integration.test.ts`

**Interfaces — Produces:**

```ts
export type TWebhookOutcome =
  | 'PROCESSED' | 'DUPLICATE' | 'ALREADY_PAID'
  | 'IGNORED_EVENT_TYPE' | 'IGNORED_UNKNOWN_CHARGE' | 'REJECTED_AMOUNT_MISMATCH';

export const CLOUD_BILLING_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

export const handleOpapingouWebhook: (options: {
  rawBody: string;
  signature: string | null | undefined;
  now?: Date;
}) => Promise<{ status: number; outcome: TWebhookOutcome | 'DISABLED' | 'BODY_TOO_LARGE' | 'INVALID_SIGNATURE' | 'INVALID_BODY'; eventId?: string; chargeId?: string }>;
```

- [ ] **Step 1: Testes sem banco** (`handle-webhook.test.ts`): cobrança desligada → 404; corpo de 64 KB + 1 → 413; assinatura inválida → 401; segredo ausente → 401; JSON inválido com assinatura válida → 400.
- [ ] **Step 2: Testes de integração.**
  - pagamento válido → 200 `PROCESSED`; cobrança `PAID` com `paidAt`, `periodStart`, `periodEnd`; assinatura criada com um mês;
  - mesmo evento reentregue → 200 `DUPLICATE`; o período não muda; existe um registro de evento só;
  - dois eventos com ids diferentes para a mesma cobrança → o segundo é `ALREADY_PAID`; o período não muda;
  - o mesmo evento entregue duas vezes em paralelo (`Promise.all`) → exatamente um `PROCESSED`, e o período é de um mês;
  - valor `50.00` para cobrança de `99.90` → `REJECTED_AMOUNT_MISMATCH`; cobrança segue `PENDING`; sem assinatura;
  - referência desconhecida → `IGNORED_UNKNOWN_CHARGE`;
  - evento de outro tipo → `IGNORED_EVENT_TYPE`;
  - cobrança localizada só pelo id do provedor (sem referência) → `PROCESSED`;
  - pagamento de cobrança `EXPIRED` → `PROCESSED`;
  - renovação com período ainda válido → o novo fim é o fim antigo mais um mês.
- [ ] **Step 3 a 5:** rodar, implementar, rodar.
- [ ] **Step 6: Rota Hono.** `billingWebhookRoute` lê `await c.req.text()`, chama o handler, registra no log só `outcome`, `eventId` e `chargeId`, e responde `c.json({ outcome }, status)`. Registrar em `router.ts` com `app.route('/api/billing/opapingou', billingWebhookRoute)` e limite de taxa `billing.webhook` (120 por minuto).
- [ ] **Step 7: Commit** `feat(billing): webhook do Opa Pingou com verificação e idempotência`.

### Task 8: Limites e trava de envio

**Files:**
- Create: `packages/lib/server-only/cloud-billing/assert-organisation-can-send.ts`, `assert-organisation-can-send.test.ts`
- Modify: `get-server-limits.ts` e seu teste, `limits.tsx`, `send-document.ts`, `resend-document.ts`, `create-document-from-direct-template.ts`

**Interfaces — Produces:**

```ts
// get-server-limits.ts
export type TLimitsSubscription = { state: TCloudSubscriptionState; isSendingAllowed: boolean };
export type TLimitsResponse = { /* campos atuais */ subscription: TLimitsSubscription };
export const buildLimitsResponse: (
  claim: { envelopeItemCount: number; recipientCount: number } | null,
  subscription?: TLimitsSubscription,
) => TLimitsResponse;

// assert-organisation-can-send.ts
export const SUBSCRIPTION_REQUIRED_ERROR_CODE = 'SUBSCRIPTION_REQUIRED';
export const assertSendingAllowed: (state: TCloudSubscriptionState) => void; // pura
export const assertOrganisationCanSendDocuments: (options: { teamId: number; now?: Date }) => Promise<void>;
```

- [ ] **Step 1: Testes que falham.**
  - `buildLimitsResponse(claim)` sem assinatura → `{ state: 'DISABLED', isSendingAllowed: true }`;
  - `buildLimitsResponse(claim, { state: 'NONE', isSendingAllowed: false })` mantém as cotas em `Infinity`;
  - `assertSendingAllowed('NONE')` e `('EXPIRED')` lançam `AppError` com código `SUBSCRIPTION_REQUIRED` e `statusCode` 402;
  - `assertSendingAllowed('DISABLED' | 'ACTIVE' | 'GRACE')` não lança;
  - com a cobrança desligada, `assertOrganisationCanSendDocuments` resolve sem tocar no Prisma (`vi.mock('@documenso/prisma')` com `findFirst` que lança se chamado).
- [ ] **Step 2 a 4:** rodar, implementar, rodar.
- [ ] **Step 5: Encaixar a trava** logo depois de `assertUserNotDisabled*` em `sendDocument` e `resendDocument`, e no início de `createDocumentFromDirectTemplate`, depois de carregar o modelo (usa `template.teamId`).
- [ ] **Step 6: Commit** `feat(billing): estado da assinatura no módulo de limites e trava de envio`.

### Task 9: Rotas tRPC

**Files:**
- Create: `packages/trpc/server/billing-router/router.ts`, `get-subscription.ts`, `get-subscription.types.ts`, `create-checkout.ts`, `create-checkout.types.ts`
- Modify: `packages/trpc/server/router.ts`

- [ ] **Step 1: Implementar.** As duas rotas usam `authenticatedProcedure` e conferem a permissão com `buildOrganisationWhereQuery({ organisationId, userId, roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_BILLING'] })`. Sem acesso → `AppError` `NOT_FOUND`. Com a cobrança desligada, `createCheckout` → `NOT_FOUND`.
- [ ] **Step 2:** registrar `billing: billingRouter` em `appRouter`.
- [ ] **Step 3:** `npx tsc --noEmit -p packages/trpc`. Esperado: 0 erros.
- [ ] **Step 4: Commit** `feat(billing): rotas tRPC de assinatura e checkout`.

### Task 10: Interface

**Files:**
- Create: `apps/remix/app/routes/_authenticated+/o.$orgUrl.settings.billing.tsx`
- Create: `apps/remix/app/components/general/cloud-billing/cloud-subscription-banner.tsx`
- Modify: `packages/lib/utils/settings-nav.ts` e seu teste se existir, `get-organisation-session.ts` e `.types.ts`, `t.$teamUrl+/_layout.tsx`, `_authenticated+/_layout.tsx`, `toast-error-messages.ts`

- [ ] **Step 1: Sessão.** Incluir `cloudSubscription: { select: { currentPeriodEnd: true } }` na consulta e `cloudSubscription: z.object({ currentPeriodEnd: z.date() }).nullable()` no schema.
- [ ] **Step 2: Menu.** Item `{ key: 'billing', path: '/o/<url>/settings/billing', label: msg`Plan`, icon: CreditCardIcon }` no fim do grupo da organização, só com `IS_CLOUD_BILLING_ENABLED()` e `MANAGE_BILLING`.
- [ ] **Step 3: Layout do time.** Calcular `subscription` com `getCloudSubscriptionState` e passar ao `LimitsProvider`. As cotas não mudam.
- [ ] **Step 4: Tela de plano**, seguindo `o.$orgUrl.settings.reminders.tsx`: `SettingsHeader`, `trpc.billing.getSubscription.useQuery`, `trpc.billing.createCheckout.useMutation`, botão de copiar o código Pix.
- [ ] **Step 5: Faixa e mensagem de erro.** Faixa amarela no layout autenticado quando o estado é `NONE` ou `EXPIRED`. `SUBSCRIPTION_REQUIRED` em `getDistributeErrorMessage` e `getDirectTemplateErrorMessage`.
- [ ] **Step 6:** `npm run typecheck -w @documenso/remix`. Esperado: 0 erros.
- [ ] **Step 7: Commit** `feat(billing): tela de plano e aviso de assinatura`.

### Task 11: Documentação de ambiente e traduções

**Files:**
- Modify: `.env.example`, `turbo.json`, `packages/tsconfig/process-env.d.ts`, `packages/lib/translations/pt-BR/web.po`

- [ ] **Step 1:** bloco `[[CLOUD BILLING]]` no `.env.example`, com as quatro variáveis **sem valor** e um comentário por variável.
- [ ] **Step 2:** as quatro variáveis em `globalEnv` do `turbo.json` e, opcionais, em `process-env.d.ts`.
- [ ] **Step 3:** traduções pt-BR das frases novas, acrescentadas ao catálogo sem reescrever o resto do arquivo.
- [ ] **Step 4: Commit** `docs(billing): variáveis de ambiente e traduções da cobrança cloud`.

### Task 12: Verificação

- [ ] **Step 1:** `npx biome check <arquivos alterados>`: 0 erros e 0 avisos nos arquivos tocados. `npx biome check .` para comparar com a linha de base (3 erros, 810 avisos, 26 infos, todos fora do escopo).
- [ ] **Step 2:** `npx tsc --noEmit` em `packages/lib`, `packages/trpc`, `packages/ui`, e `npm run typecheck -w @documenso/remix`. Linha de base: 2 erros antigos em `packages/lib`, 0 nos demais. Não pode aparecer erro novo.
- [ ] **Step 3:** `npm run test -w @documenso/lib`, sem e com `CLOUD_BILLING_TEST_DATABASE_URL`. Linha de base: 242 testes.
- [ ] **Step 4:** `npm run build`.
- [ ] **Step 5:** `docker rm -f -v test-docverse-billing-db`.
- [ ] **Step 6:** `git push -u origin docverse/cloud-billing` e abrir o PR em `engenhariainversa/documenso`, **como rascunho**, com as premissas listadas como pontos a confirmar.

### Task 13: Seção de planos da landing page (PR separado)

Branch `docverse/landing-pricing`, a partir da `main`, em worktree próprio. Independente das tarefas anteriores.

**Files:**
- Create: `apps/remix/app/components/general/landing/landing-pricing-section.tsx`
- Create: `packages/lib/constants/landing-pricing.ts`, `landing-pricing.test.ts`

- [ ] **Step 1: Teste que falha** dos dados dos planos: dois planos, `self-hosted` com preço `0` e `cloud` com `9990` centavos; `formatPlanPrice(9990) → "R$ 99,90"`, `formatPlanPrice(0) → "Grátis"`.
- [ ] **Step 2 a 4:** rodar, implementar, rodar.
- [ ] **Step 5: Componente** com os dois cartões, responsivo, sem depender de sessão.
- [ ] **Step 6:** lint e tipos; commit; push; PR separado, como rascunho.
