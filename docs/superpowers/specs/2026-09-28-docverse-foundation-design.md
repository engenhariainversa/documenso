# Docverse — Sub-projeto 1: Fundação (fork 100% open source)

- **Data:** 2026-09-28
- **Status:** rascunho para aprovação
- **Branch:** `docverse/foundation`
- **Base:** `documenso/documenso` v2.18.0 (commit `a1d4bec`)

## Objetivo

Transformar o fork do Documenso no **Docverse**, um produto 100% AGPLv3, sem nenhum código sob a licença comercial do Documenso (`packages/ee`), sem travas de licença, sem telemetria para servidores do Documenso e com a marca visível trocada para Docverse.

Este sub-projeto é a base para os seguintes (deploy, assinatura qualificada BirdID, OTP, domínio de e-mail por organização, SSO por organização).

## Fora de escopo

- Reimplementar domínio de e-mail por organização (sub-projeto 3), SSO por organização (sub-projeto 4) e assinatura remota/CSC (sub-projeto 5). Aqui essas features ficam **desligadas e escondidas**, sem código do `ee`.
- Identidade visual definitiva (task DOC-2). Aqui usamos logo e favicon provisórios (wordmark em texto "Docverse").
- Renomear os pacotes internos `@documenso/*` (decisão: manter para preservar o sync com o upstream).
- Deploy (sub-projeto 6).

## Regras

1. **Sala limpa:** nenhum código de `packages/ee` é copiado, adaptado ou usado como referência. Stubs e substituições são escritos a partir das **call sites AGPL** (assinatura das funções importadas) e do comportamento observável.
2. **Mínima divergência do upstream:** preferir remover chamadas e condicionar por flags existentes a reescrever arquivos. Toda alteração fora de `packages/ee` deve ser pequena e localizada.
3. **Traduções preservadas:** trocas de texto de "Documenso" para "Docverse" são feitas no código-fonte **e** nos catálogos `.po` (msgid e msgstr) de todos os idiomas, para não perder as traduções (pt-BR incluído).

## Design

### 1. Remoção do `packages/ee`

A pasta `packages/ee` é apagada, junto com a dependência `@documenso/ee` em `apps/remix/package.json`, o path em `apps/remix/tsconfig.json` e as entradas do `package-lock.json`.

Os 45 arquivos que importam de `@documenso/ee` são tratados por grupo:

| Grupo | Tratamento |
|---|---|
| **limits** (`useLimits`, `LimitsProvider`, `getServerLimits`, `limitsHandler`, constantes) | Novo módulo AGPL `packages/lib/server-only/limits/` (+ `packages/lib/client-only/providers/limits.tsx`) escrito do zero: sempre retorna limites ilimitados (`documents`, `recipients`, `directTemplates` = `Infinity`), mantendo o formato de resposta que as telas consomem. As constantes `DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT` e `DEFAULT_RECIPIENT_COUNT` passam a viver em `packages/lib/constants/limits.ts`. Imports repontados. |
| **stripe / billing** | Removido. Rotas `billing.*` do `enterprise-router`, rota `api/stripe.webhook`, jobs de sync de assentos, rotas admin de Stripe, telas de billing/planos/faturas e o banner de billing saem. Chamadas a `createCustomer`/`syncMemberCountWithStripeSeatPlan` em `create-organisation` e `accept-organisation-invitation` são removidas. `NEXT_PUBLIC_FEATURE_BILLING_ENABLED` deixa de existir (billing sempre desligado). |
| **email domains** | Desligado até o sub-projeto 3. Rotas `organisation.emailDomain.*` e `organisation.email.*` do `enterprise-router`, job `sync-email-domains`, rota admin `reregister-email-domain` e as telas correspondentes são removidas. O seletor de "e-mail remetente" nos diálogos de envio/configuração fica escondido (sem domínios, só existe o remetente padrão). |
| **auth portal (SSO por org)** | Desligado até o sub-projeto 4. Rotas `organisation.authenticationPortal.*`, `handle-oauth-organisation-callback-url` (fluxo de vínculo de conta) e as telas `o.$orgUrl.settings.sso` / `organisation.sso.confirmation.$token` / `o.$orgUrl.signin` saem. O OIDC global da instância continua funcionando. |
| **signing/csc** | Removido até o sub-projeto 5. Transporte `csc`, rotas OAuth montadas em `apps/remix/server/router.ts`, `csc.signEnvelope`, `prepareCscRecipientSigning`, leitura de cookies CSC na página de assinatura, `finalizeTspEnvelopeCompletion` no `seal-document` e `materializeTspAnchorsForEnvelope` no `send-document` saem. `IS_INSTANCE_CSC_MODE` passa a ser sempre `false` e o nível de assinatura é sempre SES. Colunas/enums do Prisma ligados a CSC/TSP **não** são removidos nesta etapa (evita migração destrutiva; o sub-projeto 5 redesenha o modelo). |

Após a remoção, o `enterprise-router` fica vazio e é retirado do router raiz.

### 2. Remoção das travas de licença

- Removidos: `packages/lib/server-only/license/*`, `packages/lib/types/license.ts`, `admin-license-card`, `admin-license-status-banner`, o aviso de licença expirada em `root.tsx`, `LicenseClient.start()` em `apps/remix/server/router.ts` e a variável `NEXT_PRIVATE_DOCUMENSO_LICENSE_KEY`.
- As flags de claim continuam existindo como **opções por organização**, configuráveis pelo admin na tela de Claims. O atributo `isEnterprise` é removido de `SUBSCRIPTION_CLAIM_FEATURE_FLAGS`, e a tela de admin deixa de desabilitar essas opções.
- Flags cujo código depende de features ainda não reimplementadas (`emailDomains`, `authenticationPortal`, `cscQesSigning`) ficam **ocultas** na tela de Claims até os respectivos sub-projetos.
- **Migração de dados:** a claim interna `free` (usada por toda organização nova no self-hosted) passa a ter ligadas por padrão: `unlimitedDocuments`, `allowCustomBranding`, `hidePoweredBy`, `embedSigning`, `embedSigningWhiteLabel`, `embedAuthoring`, `embedAuthoringWhiteLabel`, `cfr21` (reautenticação na assinatura) e `signingReminders`. As claims de organizações já existentes são atualizadas da mesma forma.
- Com isso ficam liberados sem licença: embed do editor, marca branca e reautenticação/OTP na assinatura.

### 3. Telemetria e chamadas externas

- Removido o `telemetry-client` (PostHog do Documenso) e seu start no servidor, e o schema `site-settings/telemetry`.
- O PostHog de produto (`NEXT_PUBLIC_POSTHOG_KEY`) continua opcional e vazio por padrão.
- Links para `documenso.com` (pricing, suporte, openapi, links padrão de e-mails) passam a apontar para a própria instância (`NEXT_PUBLIC_WEBAPP_URL`) ou para o repositório do Docverse; links de upsell/pricing são removidos.

### 4. Marca visível

- **Constante única:** `packages/lib/constants/brand.ts` com `APP_NAME = 'Docverse'`, `APP_SOURCE_URL = 'https://github.com/engenhariainversa/documenso'` e `APP_UPSTREAM_URL = 'https://github.com/documenso/documenso'`. Usada onde o nome não é texto traduzível (issuer de 2FA, `rpName` de passkey, `SMTP_FROM_NAME` padrão, motivo padrão da assinatura, títulos de página).
- **Textos traduzíveis:** "Documenso" → "Docverse" nas strings de UI, e-mails e certificado de conclusão, com a mesma troca aplicada nos catálogos `.po` de todos os idiomas e catálogos recompilados.
- **"Documenso, Inc."** em rodapés e metadados → "Docverse".
- **Logo e favicon:** wordmark provisório "Docverse" (SVG de texto) e favicons gerados a partir dele, substituindo os do Documenso em `apps/remix/public`, `packages/assets` e nos e-mails. Definitivos virão da task DOC-2.
- **Não mudam** (compatibilidade de API): header `X-Documenso-Secret` dos webhooks, rotas `/api/v1` e `/api/v2`, nomes de variáveis de ambiente `NEXT_PRIVATE_*`/`NEXT_PUBLIC_*`, nomes de pacotes.

### 5. Atribuição e AGPL

- `NOTICE` na raiz: "Docverse é um trabalho derivado do Documenso (https://github.com/documenso/documenso), © Documenso, Inc., licenciado sob AGPLv3. Modificações © Engenharia Inversa, AGPLv3."
- `README.md` reescrito para o Docverse, explicando a origem, a licença e que o projeto não usa nenhum código da licença comercial do Documenso.
- **AGPL §13:** rodapé da aplicação e da página de assinatura exibem "Código-fonte" com link para `APP_SOURCE_URL`, garantindo que todo usuário pela rede (inclusive signatários) tenha acesso ao código.
- Os cabeçalhos de copyright existentes nos arquivos são mantidos.

## Testes e verificação

- `npx tsc --noEmit` nos pacotes `@documenso/lib`, `@documenso/trpc`, `@documenso/remix`, `@documenso/ui`, `@documenso/auth`, `@documenso/email`, `@documenso/api`.
- `npm run lint` (biome) sem erros novos.
- Testes unitários existentes (`vitest`) passando; testes que cobriam licença/billing/CSC são removidos junto com o código.
- `grep -r "@documenso/ee"` e `grep -r "license.documenso.com"` retornam vazio.
- Build de produção (`npm run build --filter=@documenso/remix`) e imagem Docker (`docker/Dockerfile`) gerados com sucesso.
- Smoke test manual na imagem Docker: criar conta, enviar documento para 2 signatários, assinar com OTP por e-mail (reautenticação), baixar o PDF selado e o certificado de conclusão com a marca Docverse; abrir o embed do editor com token de API.
- E2E Playwright: o Chromium do Playwright não suporta Ubuntu 26.04 nesta máquina; E2E fica para rodar em container/CI no sub-projeto 6.

## Riscos

- **Zona cinzenta jurídica:** embed do editor e reautenticação na assinatura já são código AGPL, mas o Documenso os lista como pagos em `packages/ee/FEATURES`. Mitigação: validação jurídica antes do lançamento público com domínio próprio.
- **Sync com o upstream:** arquivos centrais (página de assinatura, seal-document, send-document, routers) passam a divergir. Mitigação: alterações mínimas e localizadas; sync a cada 2–4 semanas.
- **Traduções:** troca de msgid pode deixar strings sem tradução se algum `.po` não for atualizado. Mitigação: script único de troca aplicado ao código e aos `.po`, seguido de `lingui extract` para detectar órfãos.
