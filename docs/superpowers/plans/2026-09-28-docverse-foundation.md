# Docverse Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover todo o código sob licença comercial (`packages/ee`), as travas de licença e a telemetria do Documenso, e trocar a marca visível para Docverse, mantendo o app funcionando.

**Architecture:** Substituímos o único módulo do `ee` que o núcleo realmente usa (limits) por um módulo AGPL escrito do zero em `packages/lib`; todo o resto do `ee` (billing, email domains, auth portal, CSC) é removido junto com as call sites e telas, deixando essas features desligadas até seus sub-projetos. A marca é trocada por script aplicado ao código e aos catálogos `.po`.

**Tech Stack:** TypeScript, React Router (Remix) + Hono, tRPC, Prisma/Postgres, Lingui, Vitest, Biome, npm workspaces + Turborepo.

**Spec:** `docs/superpowers/specs/2026-09-28-docverse-foundation-design.md`

## Global Constraints

- **Sala limpa:** NUNCA abrir, ler, copiar ou adaptar arquivos dentro de `packages/ee/`. Só é permitido: listar nomes de arquivo e ler as linhas `import ... from '@documenso/ee/...'` nas call sites fora do `ee`.
- Pacotes internos continuam `@documenso/*`. Não renomear pacotes, env vars, rotas `/api/v1` `/api/v2` nem o header `X-Documenso-Secret`.
- Nome do produto: `Docverse`. Repositório: `https://github.com/engenhariainversa/documenso`. Upstream: `https://github.com/documenso/documenso`.
- Siga `AGENTS.md` e `CODE_STYLE.md` (type > interface, sem if de uma linha, `<Trans>` para textos, AppError).
- Não rode `npm run build` a cada passo; use `npx tsc --noEmit -p <pacote>` (build completo só na Task 9).
- Commits: mensagem convencional em português, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Use `git -c core.hooksPath=/dev/null commit` (husky roda npm install no precommit).
- Playwright não roda nesta máquina (Ubuntu 26.04). Não tente instalar browsers; use `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` se precisar de `npm ci`.

### Comando de typecheck (usado em várias tasks)

```bash
cd /mnt/hd2tb/projetos/documenso/repo
for p in packages/lib packages/trpc packages/ui packages/auth packages/email packages/api apps/remix; do
  echo "== $p"; npx tsc --noEmit -p $p 2>&1 | grep -v "^$" | head -30
done
```

Antes da Task 1, rode esse comando uma vez e salve a saída em `../tsc-baseline.txt` — erros que já existiam no upstream não contam como regressão.

---

### Task 1: Módulo de limites AGPL (substitui `ee/limits`)

**Files:**
- Create: `packages/lib/constants/limits.ts`
- Create: `packages/lib/server-only/limits/get-server-limits.ts`
- Create: `packages/lib/server-only/limits/get-server-limits.test.ts`
- Create: `packages/lib/client-only/providers/limits.tsx`
- Modify (repontar imports): os 17 arquivos listados no Step 6
- Delete: `apps/remix/app/routes/api+/limits.tsx`

**Interfaces:**
- Produces:
  - `UNLIMITED_LIMITS: TLimits` onde `type TLimits = { documents: number; recipients: number; directTemplates: number }` (todos `Infinity`)
  - `DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT = 5`, `DEFAULT_RECIPIENT_COUNT = 20`
  - `type TLimitsResponse = { quota: TLimits; remaining: TLimits; maximumEnvelopeItemCount: number; maximumRecipientCount: number }`
  - `buildLimitsResponse(claim: { envelopeItemCount: number; recipientCount: number } | null): TLimitsResponse`
  - `getServerLimits({ userId, teamId }: { userId: number; teamId: number }): Promise<TLimitsResponse>`
  - `LimitsProvider({ initialValue, teamId, disableLimitsFetch?, children })` e `useLimits(): TLimitsResponse & { isLoading: boolean; refreshLimits: () => Promise<void> }`

- [ ] **Step 1: Escrever o teste que falha**

`packages/lib/server-only/limits/get-server-limits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT, DEFAULT_RECIPIENT_COUNT } from '../../constants/limits';
import { buildLimitsResponse } from './get-server-limits';

describe('buildLimitsResponse', () => {
  it('returns unlimited quota and remaining', () => {
    const result = buildLimitsResponse({ envelopeItemCount: 10, recipientCount: 0 });

    expect(result.quota.documents).toBe(Infinity);
    expect(result.remaining.documents).toBe(Infinity);
    expect(result.remaining.recipients).toBe(Infinity);
    expect(result.remaining.directTemplates).toBe(Infinity);
  });

  it('uses the organisation claim counts', () => {
    const result = buildLimitsResponse({ envelopeItemCount: 10, recipientCount: 0 });

    expect(result.maximumEnvelopeItemCount).toBe(10);
    expect(result.maximumRecipientCount).toBe(0);
  });

  it('falls back to defaults without a claim', () => {
    const result = buildLimitsResponse(null);

    expect(result.maximumEnvelopeItemCount).toBe(DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT);
    expect(result.maximumRecipientCount).toBe(DEFAULT_RECIPIENT_COUNT);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd packages/lib && npx vitest run server-only/limits/get-server-limits.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar constantes e servidor**

`packages/lib/constants/limits.ts`:

```ts
export type TLimits = {
  documents: number;
  recipients: number;
  directTemplates: number;
};

export const UNLIMITED_LIMITS: TLimits = {
  documents: Infinity,
  recipients: Infinity,
  directTemplates: Infinity,
};

/**
 * Initial value for the frontend before values are loaded from the server.
 */
export const DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT = 5;

/**
 * Initial value for the frontend. 0 = unlimited recipients.
 */
export const DEFAULT_RECIPIENT_COUNT = 20;
```

`packages/lib/server-only/limits/get-server-limits.ts`:

```ts
import { prisma } from '@documenso/prisma';

import {
  DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
  DEFAULT_RECIPIENT_COUNT,
  type TLimits,
  UNLIMITED_LIMITS,
} from '../../constants/limits';

export type TLimitsResponse = {
  quota: TLimits;
  remaining: TLimits;
  maximumEnvelopeItemCount: number;
  maximumRecipientCount: number;
};

export type GetServerLimitsOptions = {
  userId: number;
  teamId: number;
};

export const buildLimitsResponse = (
  claim: { envelopeItemCount: number; recipientCount: number } | null,
): TLimitsResponse => {
  return {
    quota: UNLIMITED_LIMITS,
    remaining: UNLIMITED_LIMITS,
    maximumEnvelopeItemCount: claim?.envelopeItemCount ?? DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT,
    maximumRecipientCount: claim?.recipientCount ?? DEFAULT_RECIPIENT_COUNT,
  };
};

/**
 * Docverse has no plans: document quotas are always unlimited. Only the
 * per-organisation envelope item and recipient caps from the claim apply.
 */
export const getServerLimits = async ({ userId, teamId }: GetServerLimitsOptions): Promise<TLimitsResponse> => {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      teamGroups: {
        some: {
          organisationGroup: {
            organisationGroupMembers: {
              some: {
                organisationMember: {
                  userId,
                },
              },
            },
          },
        },
      },
    },
    select: {
      organisation: {
        select: {
          organisationClaim: {
            select: {
              envelopeItemCount: true,
              recipientCount: true,
            },
          },
        },
      },
    },
  });

  return buildLimitsResponse(team?.organisation.organisationClaim ?? null);
};
```

Antes de finalizar, confirme no `packages/prisma/schema.prisma` que o caminho `Team → teamGroups → organisationGroup → organisationGroupMembers → organisationMember.userId` existe (é o mesmo usado em `packages/lib/server-only/team/get-team.ts`; copie o filtro de membro de lá se divergir).

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd packages/lib && npx vitest run server-only/limits/get-server-limits.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Provider de cliente**

`packages/lib/client-only/providers/limits.tsx`:

```tsx
import { createContext, useContext } from 'react';

import type { TLimitsResponse } from '../../server-only/limits/get-server-limits';

export type LimitsContextValue = TLimitsResponse & {
  isLoading: boolean;
  refreshLimits: () => Promise<void>;
};

const LimitsContext = createContext<LimitsContextValue | null>(null);

export type LimitsProviderProps = {
  initialValue: Omit<TLimitsResponse, 'maximumRecipientCount'> & { maximumRecipientCount?: number };
  teamId: number;
  disableLimitsFetch?: boolean;
  children?: React.ReactNode;
};

/**
 * Limits are static in Docverse (no plans), so there is nothing to fetch:
 * the provider only exposes the value computed by the parent layout.
 */
export const LimitsProvider = ({ initialValue, children }: LimitsProviderProps) => {
  const value: LimitsContextValue = {
    ...initialValue,
    maximumRecipientCount: initialValue.maximumRecipientCount ?? 0,
    isLoading: false,
    refreshLimits: async () => {},
  };

  return <LimitsContext.Provider value={value}>{children}</LimitsContext.Provider>;
};

export const useLimits = () => {
  const limits = useContext(LimitsContext);

  if (!limits) {
    throw new Error('useLimits must be used within a LimitsProvider');
  }

  return limits;
};
```

`maximumRecipientCount` 0 = ilimitado (mesma semântica de `DEFAULT_RECIPIENT_COUNT`).

- [ ] **Step 6: Repontar imports**

Troque os imports, sem mudar a lógica das telas:

| Import antigo | Import novo |
|---|---|
| `@documenso/ee/server-only/limits/provider/client` (`useLimits`, `LimitsProvider`) | `@documenso/lib/client-only/providers/limits` |
| `@documenso/ee/server-only/limits/server` (`getServerLimits`) | `@documenso/lib/server-only/limits/get-server-limits` |
| `@documenso/ee/server-only/limits/constants` (`PAID_PLAN_LIMITS`) | `UNLIMITED_LIMITS` de `@documenso/lib/constants/limits` |
| `@documenso/ee/server-only/limits/constants` (`DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT`) | `@documenso/lib/constants/limits` |

Arquivos:
`apps/remix/app/components/dialogs/envelope-delete-dialog.tsx`, `apps/remix/app/components/dialogs/template-direct-link-dialog.tsx`, `apps/remix/app/components/general/document/document-upload-button-legacy.tsx`, `apps/remix/app/components/general/envelope-editor/envelope-editor-recipient-form.tsx`, `apps/remix/app/components/general/envelope-editor/envelope-editor-upload-page.tsx`, `apps/remix/app/components/general/envelope/envelope-drop-zone-wrapper.tsx`, `apps/remix/app/components/general/envelope/envelope-upload-button.tsx`, `apps/remix/app/components/tables/templates-table.tsx`, `packages/ui/primitives/document-flow/add-signers.tsx`, `apps/remix/app/routes/_authenticated+/t.$teamUrl+/_layout.tsx`, `apps/remix/app/routes/embed+/v2+/authoring+/_layout.tsx`, `packages/api/v1/implementation.ts`, `packages/trpc/server/document-router/create-document-temporary.ts`, `packages/trpc/server/document-router/create-document.ts`, `packages/trpc/server/envelope-router/create-envelope.ts`, `packages/trpc/server/envelope-router/use-envelope.ts`, `packages/trpc/server/template-router/router.ts`, `packages/lib/utils/organisations-claims.ts`.

Em `t.$teamUrl+/_layout.tsx`, no `useMemo` de `limits`, troque `maximumEnvelopeItemCount: DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT` por `maximumEnvelopeItemCount: organisation.organisationClaim?.envelopeItemCount ?? DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT` somente se `organisation.organisationClaim` existir no tipo; caso contrário mantenha a constante.

Apague `apps/remix/app/routes/api+/limits.tsx` (o provider não busca mais `/api/limits`).

- [ ] **Step 7: Verificar**

Run: `grep -rn "@documenso/ee/server-only/limits" --include=*.ts --include=*.tsx apps packages | grep -v "^packages/ee/"`
Expected: vazio. Depois rode o comando de typecheck e compare com `../tsc-baseline.txt` (erros novos só podem vir de imports do `ee` ainda não tratados nas Tasks 2–4).

- [ ] **Step 8: Commit**

```bash
git add -A packages/lib apps/remix packages/ui packages/api packages/trpc
git -c core.hooksPath=/dev/null commit -m "feat: módulo de limites AGPL substitui ee/limits"
```

---

### Task 2: Remover billing / Stripe

**Files:**
- Delete: `apps/remix/app/routes/api+/stripe.webhook.ts`, `packages/lib/jobs/definitions/internal/sync-organisation-seats.handler.ts` (e sua definição/registro em `packages/lib/jobs/client.ts` ou equivalente), `packages/trpc/server/admin-router/create-stripe-customer.ts`, `packages/trpc/server/admin-router/sync-organisation-subscription.ts`, `packages/trpc/server/enterprise-router/{create-subscription,get-invoices,get-plans,get-subscription,manage-subscription,sync-subscription}.ts` (+ `.types.ts`), `packages/lib/server-only/team/find-organisation-invoices.ts`, `apps/remix/app/components/general/billing-plans.tsx`, `apps/remix/app/routes/_authenticated+/o.$orgUrl.settings.billing.tsx`, `apps/remix/app/components/general/organisations/organisation-billing-banner.tsx`, `organisation-billing-portal-button.tsx`, `organisation-billing-invoices-table.tsx`
- Modify: `packages/lib/constants/app.ts` (`IS_BILLING_ENABLED`), `packages/lib/server-only/organisation/create-organisation.ts`, `packages/lib/server-only/organisation/accept-organisation-invitation.ts`, `packages/trpc/server/organisation-router/create-organisation.ts`, `packages/trpc/server/admin-router/router.ts`, `packages/trpc/server/enterprise-router/router.ts`, `apps/remix/app/components/dialogs/organisation-create-dialog.tsx`, navegação de settings (`packages/lib/utils/settings-nav.ts`) e qualquer tela que importe os componentes apagados

**Interfaces:**
- Produces: `IS_BILLING_ENABLED(): false` (constante, sem env); `enterprise-router` sem a chave `billing`.

- [ ] **Step 1: Fixar billing desligado**

Em `packages/lib/constants/app.ts`, substitua o corpo de `IS_BILLING_ENABLED` por:

```ts
/**
 * Docverse has no billing. Kept as a function so upstream call sites stay untouched.
 */
export const IS_BILLING_ENABLED = () => false;
```

Remova `NEXT_PUBLIC_FEATURE_BILLING_ENABLED` de `.env.example`, `packages/tsconfig/process-env.d.ts` e `packages/lib/utils/env.ts` (se listado).

- [ ] **Step 2: Remover chamadas a Stripe no núcleo**

- `packages/lib/server-only/organisation/create-organisation.ts`: remova o import de `createCustomer` e o bloco `if (!customerId && IS_BILLING_ENABLED()) { ... }`. Mantenha o parâmetro `customerId` opcional.
- `packages/lib/server-only/organisation/accept-organisation-invitation.ts`: remova o import de `update-subscription-item-quantity` e a chamada de sync de assentos.
- `packages/trpc/server/organisation-router/create-organisation.ts`: remova `createCheckoutSession`/`createCustomer` e o ramo que exige pagamento; a organização é sempre criada direto com a claim `free`.
- `apps/remix/app/components/dialogs/organisation-create-dialog.tsx`: remova a seleção de plano (`InternalClaimPlans`, link de pricing); o diálogo só pede nome/URL.

- [ ] **Step 3: Remover rotas, jobs e telas de billing**

Apague os arquivos listados em **Files → Delete**. Depois remova suas referências:
- `packages/trpc/server/enterprise-router/router.ts`: remova a chave `billing` e os imports.
- `packages/trpc/server/admin-router/router.ts`: remova `createStripeCustomer` e `syncOrganisationSubscription`.
- Registro do job `sync-organisation-seats`: `grep -rn "sync-organisation-seats\|syncOrganisationSeats" packages/lib/jobs` e remova.
- Telas/links: `grep -rln "billing-plans\|organisation-billing-\|settings.billing\|enterprise.billing\|find-organisation-invoices" apps packages` e remova cada uso (itens de menu, rotas, banners). Em `packages/lib/utils/settings-nav.ts`, remova o item "Billing".

- [ ] **Step 4: Verificar**

Run: `grep -rn "@documenso/ee/server-only/stripe\|stripe.webhook\|enterprise.billing" --include=*.ts --include=*.tsx apps packages | grep -v "^packages/ee/"`
Expected: vazio. Rode o typecheck; sem erros novos vindos de billing.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: remove billing/Stripe"
```

---

### Task 3: Desligar domínios de e-mail e SSO por organização

**Files:**
- Delete: `packages/lib/jobs/definitions/internal/sync-email-domains.handler.ts` (+ definição/registro), `packages/trpc/server/admin-router/reregister-email-domain.ts`, `packages/trpc/server/enterprise-router/*email*` e `*authentication-portal*` e `link-organisation-account.ts` e `decline-link-organisation-account.ts` (+ `.types.ts`), `apps/remix/app/routes/_authenticated+/o.$orgUrl.settings.email-domains*.tsx`, `apps/remix/app/routes/_authenticated+/o.$orgUrl.settings.email*.tsx` (se só gerencia e-mails de domínio), `apps/remix/app/routes/_authenticated+/o.$orgUrl.settings.sso.tsx`, `apps/remix/app/routes/_unauthenticated+/organisation.sso.confirmation.$token.tsx`, `apps/remix/app/routes/_unauthenticated+/o.$orgUrl.signin.tsx`, diálogos/tabelas `organisation-email-*`, `organisation-email-domain-*`, `apps/remix/app/components/general/settings-upsell/email-domains-upsell.tsx`
- Modify: `packages/auth/server/lib/utils/handle-oauth-organisation-callback-url.ts` (ou o chamador dele), `packages/trpc/server/enterprise-router/router.ts`, `packages/trpc/server/admin-router/router.ts`, `packages/lib/utils/settings-nav.ts`, `apps/remix/app/components/dialogs/envelope-distribute-dialog.tsx`, `apps/remix/app/components/general/envelope-editor/envelope-editor-settings-dialog.tsx`, `packages/ui/primitives/template-flow/add-template-settings.tsx`, `packages/ui/primitives/document-flow/add-subject.tsx`, `apps/remix/app/components/forms/email-preferences-form.tsx`

**Interfaces:**
- Produces: `enterprise-router` sem `organisation.email`, `organisation.emailDomain`, `organisation.authenticationPortal`.

- [ ] **Step 1: Callback OAuth sem vínculo de organização**

Leia `packages/auth/server/lib/utils/handle-oauth-organisation-callback-url.ts` e encontre quem o chama (`grep -rn "handleOAuthOrganisationCallbackUrl\|handle-oauth-organisation-callback-url" packages/auth`). Remova o ramo de callback de organização e o import de `send-organisation-account-link-confirmation-email`; o login OIDC global (`packages/auth/server/routes/oauth*` e `oidc`) deve continuar intacto. Se o arquivo inteiro só existir para o portal por organização, apague-o e remova a rota que o monta.

- [ ] **Step 2: Remover rotas, jobs e telas**

Apague os arquivos de **Files → Delete** e limpe as referências:
- `enterprise-router/router.ts`: remova `organisation.email`, `organisation.emailDomain`, `organisation.authenticationPortal`. Se o router ficar sem nenhuma rota, faça a Task 4 primeiro e só então apague o router na Task 5.
- `admin-router/router.ts`: remova `reregisterEmailDomain`.
- `packages/lib/utils/settings-nav.ts`: remova os itens "Email Domains"/"Emails" e "SSO".

- [ ] **Step 3: Esconder o seletor de remetente**

Nos 5 arquivos de UI com `trpc.enterprise.organisation.email.find`/`SelectItem value={'-1'}>Documenso` (distribute dialog, editor settings dialog, add-template-settings, add-subject, email-preferences-form): remova a query de e-mails da organização e o `Select` de remetente, mantendo o formulário enviando `emailId: null` (remetente padrão). Não altere o schema dos formulários além de tornar o campo opcional se necessário.

- [ ] **Step 4: Verificar**

Run: `grep -rn "enterprise.organisation.email\|emailDomain\.\|authenticationPortal\.\|@documenso/ee/server-only/lib" --include=*.ts --include=*.tsx apps packages | grep -v "^packages/ee/"`
Expected: vazio (menções ao modelo Prisma `EmailDomain` em `packages/lib` podem ficar). Rode o typecheck.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: desliga domínios de e-mail e SSO por organização (reimplementação nos sub-projetos 3 e 4)"
```

---

### Task 4: Remover o modo de assinatura CSC

**Files:**
- Modify: `packages/lib/jobs/definitions/internal/seal-document.handler.ts`, `packages/lib/server-only/document/send-document.ts`, `packages/trpc/server/recipient-router/router.ts`, `packages/trpc/server/enterprise-router/router.ts`, `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx`, `apps/remix/server/router.ts`, `packages/lib/constants/app.ts`, `packages/lib/server-only/cert/cert-status.ts`, `packages/tsconfig/process-env.d.ts`, `packages/lib/utils/env.ts`, `.env.example`
- Delete: `packages/trpc/server/enterprise-router/csc-sign-envelope.ts` (+ types), `apps/remix/app/components/general/csc-recipient-signing-in-progress-page.tsx` (localize com `grep -rln csc-recipient-signing-in-progress apps`)

**Interfaces:**
- Produces: `IS_INSTANCE_CSC_MODE(): false`; `NEXT_PRIVATE_SIGNING_TRANSPORT` aceita só `'local' | 'gcloud-hsm'`.

- [ ] **Step 1: Desligar o modo CSC na configuração**

Em `packages/lib/constants/app.ts`, faça `IS_INSTANCE_CSC_MODE` retornar sempre `false` e remova `CSC_INSTANCE_SIGNATURE_LEVEL` se não tiver mais usos (`grep -rn CSC_INSTANCE_SIGNATURE_LEVEL`). Remova as variáveis `NEXT_PRIVATE_SIGNING_CSC_*` e `NEXT_PUBLIC_SIGNING_TRANSPORT_IS_CSC` de `packages/tsconfig/process-env.d.ts`, `packages/lib/utils/env.ts` e `.env.example`; tire `'csc'` do union de `NEXT_PRIVATE_SIGNING_TRANSPORT`. Em `packages/lib/server-only/cert/cert-status.ts` troque `transport === 'gcloud-hsm' || transport === 'csc'` por `transport === 'gcloud-hsm'`.

- [ ] **Step 2: Remover as chamadas no fluxo de envio e selagem**

- `seal-document.handler.ts`: remova o import de `finalizeTspEnvelopeCompletion` e o bloco que o chama (linha ~183). Leia o `if` que envolve o bloco: se for um ramo exclusivo de envelopes TSP/CSC (ex.: `if (isTspEnvelope(envelope)) { ... return }`), remova o ramo inteiro para que todo envelope siga o fluxo normal de selagem com `signPdf`.
- `send-document.ts`: remova o import de `materializeTspAnchorsForEnvelope` e o `if (isTspEnvelope(envelope) && ...)` (linhas ~249–253).
- `recipient-router/router.ts`: remova `prepareCscRecipientSigning` e a rota que o usa.
- `enterprise-router/router.ts`: remova a chave `csc`.

- [ ] **Step 3: Página de assinatura e servidor**

- `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx`: remova os 3 imports de cookies CSC, a leitura dessas sessões no loader e os ramos `'csc' in data` (linhas ~506–512) e a tela de "signing in progress"; o loader não retorna mais a chave `csc`.
- `apps/remix/server/router.ts`: remova o import `csc` de `@documenso/ee/server-only/signing/csc/hono` e a montagem das rotas (comentário "CSC OAuth routes").
- Apague `csc-sign-envelope.ts` e a página `csc-recipient-signing-in-progress-page.tsx`, e remova referências.

- [ ] **Step 4: Verificar**

Run: `grep -rn "@documenso/ee/server-only/signing\|enterprise.csc\|prepareCscRecipientSigning" --include=*.ts --include=*.tsx apps packages | grep -v "^packages/ee/"`
Expected: vazio. Rode o typecheck. Rode `cd packages/lib && npx vitest run` — testes que falharem por dependerem de CSC (ex.: `resolve-signature-level`) devem ser ajustados para o comportamento "sempre SES" ou removidos se só testavam CSC.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: remove o modo de assinatura CSC (reimplementação no sub-projeto 5)"
```

---

### Task 5: Apagar `packages/ee` e o enterprise-router

**Files:**
- Delete: `packages/ee/` (pasta inteira), `packages/trpc/server/enterprise-router/` (se vazio)
- Modify: `apps/remix/package.json` (remover `"@documenso/ee": "*"`), `apps/remix/tsconfig.json` (remover path `@documenso/ee`), `packages/trpc/server/router.ts` (remover `enterprise`), `package-lock.json` (via `npm install`), `Dockerfile`s e `turbo.json` se citarem `packages/ee`

- [ ] **Step 1: Apagar e desligar**

```bash
git rm -rq packages/ee
grep -rn "enterprise" packages/trpc/server/router.ts
```
Remova a chave `enterprise` e o import do router raiz. Se `packages/trpc/server/enterprise-router/` tiver só `router.ts` e arquivos sem uso, apague a pasta.

- [ ] **Step 2: Build config**

Remova `@documenso/ee` de `apps/remix/package.json` e `apps/remix/tsconfig.json`. Rode `grep -rn "packages/ee\|@documenso/ee" --include=*.json --include=Dockerfile* --include=*.yml --include=*.ts --include=*.tsx --include=*.cjs --include=*.mjs . | grep -v node_modules` e remova cada ocorrência (inclusive `docker/Dockerfile`, `turbo.json`, `biome.json`, `crowdin.yml`, `lingui.config.ts`). Depois:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund
```

- [ ] **Step 3: Remover chamadas `trpc.enterprise.*` restantes**

Run: `grep -rn "trpc.enterprise\." apps packages`
Expected: vazio. Se sobrar algo, é tela ligada a feature removida nas Tasks 2–4: remova o uso.

- [ ] **Step 4: Verificar**

Run: `grep -rn "@documenso/ee" . --include=*.ts --include=*.tsx --include=*.json | grep -v node_modules` → vazio. Rode o typecheck: **zero erros novos** em relação a `../tsc-baseline.txt`.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: remove packages/ee (código sob licença comercial)"
```

---

### Task 6: Remover licença e telemetria; liberar flags nas claims

**Files:**
- Delete: `packages/lib/server-only/license/`, `packages/lib/types/license.ts`, `apps/remix/app/components/general/admin-license-card.tsx`, `apps/remix/app/components/general/admin-license-status-banner.tsx`, `packages/lib/server-only/telemetry/`, `packages/lib/server-only/site-settings/schemas/telemetry.ts`, `packages/app-tests/e2e/license/`
- Modify: `apps/remix/server/router.ts`, `apps/remix/app/root.tsx`, `apps/remix/app/routes/_authenticated+/admin+/_layout.tsx`, `admin+/stats.tsx`, `admin+/claims.tsx`, `admin+/organisations.$id.tsx`, `apps/remix/app/components/forms/subscription-claim-form.tsx`, `apps/remix/app/components/dialogs/claim-create-dialog.tsx`, `claim-update-dialog.tsx`, `apps/remix/app/components/tables/admin-claims-table.tsx`, `packages/lib/types/subscription.ts`, `packages/lib/server-only/site-settings/schema.ts`, `.env.example`, `packages/tsconfig/process-env.d.ts`
- Create: `packages/prisma/migrations/20260928000000_docverse_free_claim_flags/migration.sql`

**Interfaces:**
- Produces: `SUBSCRIPTION_CLAIM_FEATURE_FLAGS` sem `isEnterprise`, com `hidden?: boolean` para `emailDomains`, `authenticationPortal`, `cscQesSigning`.

- [ ] **Step 1: Remover o cliente de licença**

Remova `LicenseClient.start()` e imports de `apps/remix/server/router.ts`; o banner/aviso de licença de `root.tsx` (linha ~167) e das telas de admin; apague os arquivos de **Files → Delete**. Remova `NEXT_PRIVATE_DOCUMENSO_LICENSE_KEY` e `INTERNAL_OVERRIDE_LICENSE_SERVER_URL` de `.env.example` e `process-env.d.ts`. Run `grep -rn "license-client\|assertLicensedFor\|LicenseClient\|admin-license" apps packages` → vazio.

- [ ] **Step 2: Remover telemetria**

Apague `packages/lib/server-only/telemetry/` e o schema `site-settings/schemas/telemetry.ts`; remova o start em `apps/remix/server/router.ts` e a entrada no `site-settings/schema.ts`. Remova `DOCUMENSO_DISABLE_TELEMETRY` de `.env.example`/`process-env.d.ts`. Mantenha `packages/lib/server-only/analytics/capture-server-event.ts` (usa o PostHog opcional da própria instância). Run `grep -rn "telemetry" --include=*.ts --include=*.tsx apps packages` → só resultados não relacionados ao cliente removido.

- [ ] **Step 3: Flags livres nas claims**

Em `packages/lib/types/subscription.ts`, em `SUBSCRIPTION_CLAIM_FEATURE_FLAGS`: remova todas as propriedades `isEnterprise`; troque o label `'Hide Documenso branding by'` por `'Hide Docverse branding'`; adicione `hidden: true` a `emailDomains`, `authenticationPortal` e `cscQesSigning`; ajuste o tipo do objeto para aceitar `hidden?: boolean`. Nas telas de claims (`subscription-claim-form.tsx`, diálogos, tabela), remova qualquer `disabled` baseado em licença/`isEnterprise` e filtre `flag.hidden` da lista exibida.

- [ ] **Step 4: Migração da claim `free`**

`packages/prisma/migrations/20260928000000_docverse_free_claim_flags/migration.sql`:

```sql
-- Docverse: every paid feature is free. Enable the feature flags on the
-- internal "free" claim used by new organisations, and on existing
-- organisation claims.
UPDATE "SubscriptionClaim"
SET "flags" = COALESCE("flags", '{}'::jsonb) || '{
  "unlimitedDocuments": true,
  "allowCustomBranding": true,
  "hidePoweredBy": true,
  "embedSigning": true,
  "embedSigningWhiteLabel": true,
  "embedAuthoring": true,
  "embedAuthoringWhiteLabel": true,
  "cfr21": true,
  "signingReminders": true
}'::jsonb,
"updatedAt" = NOW()
WHERE "id" = 'free';

UPDATE "OrganisationClaim"
SET "flags" = COALESCE("flags", '{}'::jsonb) || '{
  "unlimitedDocuments": true,
  "allowCustomBranding": true,
  "hidePoweredBy": true,
  "embedSigning": true,
  "embedSigningWhiteLabel": true,
  "embedAuthoring": true,
  "embedAuthoringWhiteLabel": true,
  "cfr21": true,
  "signingReminders": true
}'::jsonb,
"updatedAt" = NOW();
```

Confira no `schema.prisma` os nomes exatos das tabelas/colunas (`SubscriptionClaim`, `OrganisationClaim`, `flags`, `updatedAt`) e ajuste se diferirem. Aplique num banco de teste:

```bash
docker run -d --rm --name docverse-mig-test -e POSTGRES_PASSWORD=p -p 127.0.0.1:55499:5432 postgres:16-alpine
sleep 5
DATABASE_URL=postgres://postgres:p@127.0.0.1:55499/postgres NEXT_PRIVATE_DATABASE_URL=postgres://postgres:p@127.0.0.1:55499/postgres NEXT_PRIVATE_DIRECT_DATABASE_URL=postgres://postgres:p@127.0.0.1:55499/postgres npx prisma migrate deploy --schema packages/prisma/schema.prisma
docker exec docverse-mig-test psql -U postgres -c "select flags from \"SubscriptionClaim\" where id='free'"
docker stop docverse-mig-test
```
Expected: `flags` da `free` contém `"cfr21": true` e `"embedAuthoring": true`.

- [ ] **Step 5: Verificar e commitar**

Typecheck sem erros novos; `cd packages/lib && npx vitest run` passando.

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: remove licença e telemetria; features liberadas por padrão nas claims"
```

---

### Task 7: Marca Docverse (textos, traduções, links)

**Files:**
- Create: `packages/lib/constants/brand.ts`, `packages/lib/constants/brand.test.ts`, `scripts/docverse-rebrand.mjs`
- Modify: arquivos com "Documenso" visível em `apps/remix`, `packages/email`, `packages/lib`, `packages/ui`, `packages/lib/translations/*/web.po`

**Interfaces:**
- Produces: `APP_NAME = 'Docverse'`, `APP_SOURCE_URL`, `APP_UPSTREAM_URL` em `@documenso/lib/constants/brand`.

- [ ] **Step 1: Teste da constante**

`packages/lib/constants/brand.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { APP_NAME, APP_SOURCE_URL, APP_UPSTREAM_URL } from './brand';

describe('brand', () => {
  it('exposes the Docverse identity', () => {
    expect(APP_NAME).toBe('Docverse');
    expect(APP_SOURCE_URL).toBe('https://github.com/engenhariainversa/documenso');
    expect(APP_UPSTREAM_URL).toBe('https://github.com/documenso/documenso');
  });
});
```

Run `cd packages/lib && npx vitest run constants/brand.test.ts` → FAIL.

- [ ] **Step 2: Constante**

`packages/lib/constants/brand.ts`:

```ts
export const APP_NAME = 'Docverse';

/**
 * Public source code of this instance (AGPLv3 §13).
 */
export const APP_SOURCE_URL = 'https://github.com/engenhariainversa/documenso';

export const APP_UPSTREAM_URL = 'https://github.com/documenso/documenso';
```

Run o teste → PASS.

- [ ] **Step 3: Usos não traduzíveis**

Troque literais por `APP_NAME`: `packages/lib/server-only/2fa/setup-2fa.ts` (`ISSUER = APP_NAME`), `packages/lib/server-only/2fa/email/generate-2fa-credentials-from-email.ts` (`` `${APP_NAME} Email 2FA` ``), `packages/lib/utils/authenticator.ts` (`rpName: APP_NAME`), `packages/lib/server-only/auth/send-forgot-password.ts` (fallback do from name), `packages/lib/constants/auth.ts` (`DOCUMENSO: APP_NAME` — mantenha a chave), `apps/remix/app/utils/meta.ts` (título, descrição sem preço, keywords, autor `APP_NAME`), `apps/remix/app/routes/_share+/share.$slug.tsx`, `apps/remix/app/components/embed/embed-document-completed.tsx`, `packages/email/template-components/template-footer.tsx` ("Documenso, Inc." → `APP_NAME`). Motivo padrão da assinatura: em `packages/lib/constants/app.ts`, `NEXT_PRIVATE_SIGNING_REASON` default `` `Signed by ${APP_NAME}` `` e atualize `packages/lib/constants/app.test.ts` para `'Signed by Docverse'`.

- [ ] **Step 4: Script de troca em textos traduzíveis e `.po`**

`scripts/docverse-rebrand.mjs`:

```js
#!/usr/bin/env node
// Replaces the visible "Documenso" brand with "Docverse" in UI/email source
// strings and in every Lingui catalogue (msgid + msgstr), so existing
// translations keep matching. Package names (@documenso/*), env vars,
// the X-Documenso-Secret header and code identifiers are left untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const roots = ['apps/remix/app', 'packages/email', 'packages/ui', 'packages/lib', 'packages/trpc'];

const files = execSync(
  `grep -rlI "Documenso" ${roots.join(' ')} --include=*.ts --include=*.tsx --include=*.po`,
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .filter((file) => !file.endsWith('.test.ts'));

const rules = [
  [/Documenso, Inc\./g, 'Docverse'],
  // Only whole-word, visible brand: not @documenso/, not DOCUMENSO_, not X-Documenso-, not identifiers like isDocumensoCloud.
  [/(?<![@\w-])Documenso(?![\w-])/g, 'Docverse'],
];

let changed = 0;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;

  for (const [pattern, replacement] of rules) {
    after = after.replace(pattern, replacement);
  }

  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
    console.log(`rebranded ${file}`);
  }
}

console.log(`${changed} files changed`);
```

Run:
```bash
node scripts/docverse-rebrand.mjs
git diff --stat | tail -3
grep -rnI "Docverse" --include=*.ts --include=*.tsx apps packages | grep -E "import|from '|X-Docverse|DOCVERSE_|isDocverse" | head
```
Expected: o último grep vazio (nenhum identificador/import renomeado por engano). Se algo aparecer, reverta essa linha.

- [ ] **Step 5: Links para documenso.com**

Run `grep -rnI "documenso.com" --include=*.ts --include=*.tsx apps/remix packages/email packages/lib packages/ui packages/api | grep -v "docs.documenso.com"`. Para cada ocorrência:
- defaults de props de templates de e-mail (`baseUrl = 'https://documenso.com'` etc.) → `NEXT_PUBLIC_WEBAPP_URL()` de `@documenso/lib/constants/app`, ou string vazia se o template não puder importar;
- links de pricing/upsell (`organisation-create-dialog`, `template-document-self-signed`) → remover o link/bloco;
- `packages/api/hono.ts` `/openapi` → redirecionar para `/api/v2/openapi.json` da própria instância se existir (`grep -rn "openapi" apps/remix/server packages/trpc/server/open-api.ts`), senão remover a rota;
- `docs.documenso.com` pode ficar (documentação técnica do upstream).

- [ ] **Step 6: Recompilar traduções e verificar**

```bash
npm run translate:compile 2>&1 | tail -5
npx lingui extract --clean 2>&1 | tail -15
git diff --stat packages/lib/translations | tail -3
```
Expected: `extract` não reporta perda de traduções pt-BR (o número de "missing" do pt-BR não deve crescer em relação ao `git stash`/main). Se o `extract` reescrever muito os `.po`, descarte a saída do `extract` (`git checkout packages/lib/translations`) e rode de novo só o `node scripts/docverse-rebrand.mjs` + `translate:compile`.

Rode o typecheck e `cd packages/lib && npx vitest run`.

- [ ] **Step 7: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: marca Docverse em textos, e-mails, traduções e links"
```

---

### Task 8: Logo provisório, NOTICE, README e link do código-fonte

**Files:**
- Create: `NOTICE`, `packages/assets/images/docverse-logo.svg`, `scripts/docverse-icons.sh`
- Modify: `README.md`, favicons em `apps/remix/public/` e `packages/assets/`, imports do logo (`grep -rn "LogoImage\|logo.png\|logo.svg" apps/remix/app packages/email packages/ui`), `apps/remix/app/components/general/app-nav-mobile.tsx`, rodapé da app e da página de assinatura

- [ ] **Step 1: Wordmark provisório**

`packages/assets/images/docverse-logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="170" height="25" viewBox="0 0 170 25">
  <text x="0" y="20" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#111827">Docverse</text>
</svg>
```

Localize o(s) logo(s) atuais (`grep -rn "LogoImage\|/logo\|static/logo" apps/remix/app packages/email packages/ui | head -20`) e aponte os imports para o novo SVG (para e-mails, copie para `apps/remix/public/static/docverse-logo.png` conforme o formato usado pelo template — se exigir PNG, gere com o script do Step 2). Ajuste `alt` para `APP_NAME`.

- [ ] **Step 2: Favicons provisórios**

`scripts/docverse-icons.sh` (usa ImageMagick via Docker, sem instalar nada no host):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
gen() {
  docker run --rm -v "$PWD":/w -w /w dpokidov/imagemagick:latest \
    -size "$1x$1" xc:'#111827' -gravity center -fill white \
    -font DejaVu-Sans-Bold -pointsize "$(( $1 * 6 / 10 ))" -annotate 0 'D' "$2"
}
for dir in apps/remix/public packages/assets; do
  gen 16 "$dir/favicon-16x16.png"
  gen 32 "$dir/favicon-32x32.png"
  gen 180 "$dir/apple-touch-icon.png"
  gen 192 "$dir/android-chrome-192x192.png"
  gen 512 "$dir/android-chrome-512x512.png"
  docker run --rm -v "$PWD":/w -w /w dpokidov/imagemagick:latest "$dir/favicon-32x32.png" "$dir/favicon.ico"
done
docker run --rm -v "$PWD":/w -w /w dpokidov/imagemagick:latest \
  -size 170x25 xc:white -gravity west -fill '#111827' -font DejaVu-Sans-Bold -pointsize 20 -annotate +0+0 'Docverse' \
  apps/remix/public/static/docverse-logo.png
```

Run `bash scripts/docverse-icons.sh` e atualize `apps/remix/public/site.webmanifest` (`name`/`short_name` = `Docverse`). Substitua `apps/remix/public/opengraph-image.jpg` por uma imagem 1200x630 gerada do mesmo jeito com o texto "Docverse". Apague `packages/assets/documenso-supporter-pledge.pdf`.

- [ ] **Step 3: NOTICE**

`NOTICE`:

```
Docverse
Copyright (C) 2026 Engenharia Inversa

Docverse is a derivative work of Documenso (https://github.com/documenso/documenso),
Copyright (C) Documenso, Inc., licensed under the GNU Affero General Public License v3.0.

Docverse is licensed under the GNU Affero General Public License v3.0 (see LICENSE).
It does not include any code distributed under the Documenso Commercial License
(the former packages/ee directory has been removed; equivalent features are
independent reimplementations).

Source code: https://github.com/engenhariainversa/documenso
```

- [ ] **Step 4: README**

Reescreva `README.md` (em português) com: o que é o Docverse; origem (fork do Documenso v2.18.0, link upstream); licença AGPLv3 e o que isso implica para quem hospeda; o que foi removido (packages/ee, billing, licença, telemetria) e que todas as features são gratuitas; como rodar localmente (`npm run dx`, `npm run dev`); link para as specs em `docs/superpowers/specs/`. Mantenha a seção de variáveis de ambiente/self-hosting apontando para `docs.documenso.com` quando o conteúdo for igual.

- [ ] **Step 5: Link "Código-fonte" (AGPL §13)**

- Rodapé da app: em `apps/remix/app/components/general/app-nav-mobile.tsx` troque `© {ano} Documenso, Inc.` por `© {ano} {APP_NAME} · <a href={APP_SOURCE_URL}>Código-fonte</a>` (use `<Trans>Source code</Trans>` para o texto do link). Localize o rodapé desktop (`grep -rn "new Date().getFullYear()" apps/remix/app`) e aplique o mesmo.
- Página de assinatura: em `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx`, os blocos "Check out Documenso" (linhas ~458 e ~557) passam a mostrar um link `APP_SOURCE_URL` com `<Trans>Source code</Trans>`. Faça o mesmo no componente "powered by" do embed de assinatura (`grep -rn "hidePoweredBy" apps/remix/app/components/embed | head`) — o link de código-fonte continua visível mesmo com `hidePoweredBy`, só o "Powered by" some.
- Rode `npm run translate:extract` se existir (senão `npx lingui extract`) para registrar a nova string e adicione a tradução pt-BR `msgstr "Código-fonte"` em `packages/lib/translations/pt-BR/web.po`; `npm run translate:compile`.

- [ ] **Step 6: Verificar e commitar**

Typecheck sem erros novos.

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "feat: logo provisório, NOTICE, README e link de código-fonte (AGPL §13)"
```

---

### Task 9: Verificação final (build, Docker e smoke test)

**Files:**
- Modify: nenhum (só correções que a verificação exigir, cada uma em commit próprio)

- [ ] **Step 1: Varreduras**

```bash
grep -rn "@documenso/ee\|license.documenso.com\|DOCUMENSO_DISABLE_TELEMETRY\|NEXT_PRIVATE_DOCUMENSO_LICENSE_KEY" . --include=*.ts --include=*.tsx --include=*.json --include=*.example --include=Dockerfile | grep -v node_modules
test ! -d packages/ee && echo "ee removido"
```
Expected: grep vazio e "ee removido".

- [ ] **Step 2: Lint, typecheck e testes**

```bash
npm run lint 2>&1 | tail -20
cd packages/lib && npx vitest run 2>&1 | tail -15; cd ../..
```
mais o comando de typecheck. Expected: lint sem erros novos em relação ao `main`; vitest verde; typecheck sem erros novos.

- [ ] **Step 3: Build de produção**

Run: `npm run build -- --filter=@documenso/remix 2>&1 | tail -30`
Expected: build concluído.

- [ ] **Step 4: Imagem Docker**

Run: `docker build -f docker/Dockerfile -t docverse:foundation . 2>&1 | tail -20`
Expected: imagem gerada.

- [ ] **Step 5: Smoke test em container**

```bash
mkdir -p ../smoke && cd ../smoke
openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -days 365 -subj "/CN=Docverse Dev"
openssl pkcs12 -export -out cert.p12 -inkey k.pem -in c.pem -passout pass:docverse
docker network create docverse-smoke || true
docker run -d --rm --name docverse-smoke-db --network docverse-smoke -e POSTGRES_PASSWORD=p -e POSTGRES_DB=docverse postgres:16-alpine
docker run -d --rm --name docverse-smoke-mail --network docverse-smoke -p 127.0.0.1:18025:8025 axllent/mailpit
sleep 5
docker run -d --rm --name docverse-smoke-app --network docverse-smoke -p 127.0.0.1:13000:3000 \
  -v "$PWD/cert.p12":/opt/documenso/cert.p12:ro \
  -e NEXTAUTH_SECRET=smoke-secret -e NEXT_PRIVATE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef \
  -e NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=abcdef0123456789abcdef0123456789 \
  -e NEXT_PUBLIC_WEBAPP_URL=http://localhost:13000 \
  -e NEXT_PRIVATE_DATABASE_URL=postgres://postgres:p@docverse-smoke-db:5432/docverse \
  -e NEXT_PRIVATE_DIRECT_DATABASE_URL=postgres://postgres:p@docverse-smoke-db:5432/docverse \
  -e NEXT_PRIVATE_SMTP_TRANSPORT=smtp-auth -e NEXT_PRIVATE_SMTP_HOST=docverse-smoke-mail -e NEXT_PRIVATE_SMTP_PORT=1025 \
  -e NEXT_PRIVATE_SMTP_FROM_NAME=Docverse -e NEXT_PRIVATE_SMTP_FROM_ADDRESS=noreply@docverse.local \
  -e NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=/opt/documenso/cert.p12 -e NEXT_PRIVATE_SIGNING_PASSPHRASE=docverse \
  docverse:foundation
sleep 30; docker logs docverse-smoke-app 2>&1 | tail -20
curl -s http://localhost:13000/ | grep -o "<title>[^<]*</title>"
curl -s http://localhost:13000/api/health
```
Confira os nomes exatos das env vars em `.env.example` e `docker/start.sh` antes de rodar (ex.: `NEXTAUTH_SECRET` pode ter outro nome). Expected: título contém "Docverse", health OK, nenhuma linha `[License]` ou `[Telemetry]` nos logs.

Em seguida, com o navegador (skill `claude-in-chrome` ou manualmente): criar conta (confirmar e-mail no mailpit `http://localhost:18025`), subir um PDF, adicionar 2 signatários com reautenticação por e-mail (2FA por e-mail na ação de assinar), assinar pelos links do mailpit, baixar o PDF final e verificar que o certificado de conclusão mostra "Docverse". Anote o resultado no commit/PR.

- [ ] **Step 6: Limpar e publicar a branch**

```bash
docker stop docverse-smoke-app docverse-smoke-db docverse-smoke-mail; docker network rm docverse-smoke
git push -u origin docverse/foundation
```

Abra um PR `docverse/foundation` → `main` no fork com o resumo das tasks, os resultados da verificação e o rodapé:
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`. **Não fazer merge** — aguarda revisão do usuário.
