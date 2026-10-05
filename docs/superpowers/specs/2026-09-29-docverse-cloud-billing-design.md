# Docverse — Cobrança da versão cloud (DOC-30)

- **Data:** 2026-09-29
- **Status:** rascunho para aprovação (PR sem merge)
- **Branch:** `docverse/cloud-billing`
- **Base:** `main` em `15cabaf6`

## Objetivo

Monetizar o Docverse sem tirar nada do self-hosted:

- **Self-hosted:** gratuito e sem limites, como hoje. Nada muda para quem não liga a cobrança.
- **Cloud:** R$ 99,90 por mês, por organização, com tudo ilimitado.

Este trabalho deixa o checkout pronto para ser ligado, usando a API do Opa Pingou (`opapingou.com.br`). Nada é ligado em produção: a cobrança nasce desligada e só liga por variável de ambiente.

## Premissas (pontos a confirmar com a dona)

Estas decisões foram tomadas para o trabalho poder andar. Todas podem ser revistas antes de ligar a cobrança.

| # | Premissa | Onde pesa se mudar |
|---|---|---|
| P1 | Cobrança **mensal** | `computeNextPeriod` e os textos da tela |
| P2 | Assinatura **por organização** (não por usuário, nem por assento) | modelo de dados e tela de plano |
| P3 | Cobrança **desligada por padrão**, ligada por variável de ambiente | `NEXT_PUBLIC_CLOUD_BILLING_ENABLED` |
| P4 | Conta cloud sem assinatura **explora** (cria rascunhos, sobe PDF, monta campos) mas **precisa assinar para enviar** | trava no envio, não na criação |

Premissas adicionais que este desenho precisou assumir e que também pedem confirmação:

| # | Premissa | Motivo |
|---|---|---|
| P5 | A organização **pessoal** de cada usuário também precisa de assinatura para enviar | "por organização" não distingue o tipo; é a leitura mais simples |
| P6 | **Reenvio** de documento já enviado também exige assinatura ativa | reenviar é enviar e-mail em nome da organização |
| P7 | **Tolerância de 3 dias** depois do vencimento antes de bloquear o envio | a renovação é manual (Pix); sem tolerância o serviço corta no minuto do vencimento |
| P8 | Documentos já enviados **continuam assináveis** com a assinatura vencida | bloquear o signatário puniria terceiros |
| P9 | Link de modelo direto (direct template) fica bloqueado sem assinatura | ele cria e envia um documento em nome da organização |
| P10 | **Lembretes automáticos** de assinatura também param sem assinatura ativa | é o mesmo tipo de e-mail do reenvio (P6); sem isso a organização vencida continuaria disparando e-mails |

## O que a API do Opa Pingou oferece (pesquisa em 2026-09-29)

Pesquisa feita só em páginas públicas, sem criar conta e sem chamar a API.

**Não existe documentação pública de API.** Os links "Docs", "Documentação", "Referência da API", "Webhooks", "Status" e "GitHub" do site apontam para `#`. `/docs`, `/api`, `/developers`, `/openapi.json` e `api.opapingou.com.br/docs` respondem 404; `docs.opapingou.com.br` não resolve. O `sitemap.xml` lista só a home, `/aplicativo`, `/termos` e `/privacidade`.

O que está publicado:

- **Produto:** roteador de cobranças Pix. Não é instituição financeira: emite a cobrança em contas que o próprio cliente conecta (Inter, C6, Abacate Pay, Mercado Pago) e escolhe a que ainda tem isenção de tarifa. O dinheiro cai direto na conta bancária do cliente.
- **Meio de pagamento:** só Pix. Sem cartão e sem boleto.
- **Preço do serviço:** plano único de R$ 9,90 por mês, cobranças ilimitadas.
- **Cadastro:** por e-mail com código de 6 dígitos; os termos pedem CNPJ para pessoa jurídica. Exige ter conta com API em pelo menos um dos bancos suportados.
- **Único exemplo de API**, na home:

  ```
  curl -X POST https://api.opapingou.com.br/v1/cobranca \
    -H "Authorization: Bearer sk_live_***" \
    -d valor=350.00

  { "banco": "inter", "motivo": "isencao_disponivel", "taxa": 0.00, "status": "pingou" }
  ```

- **Webhook:** o site cita um webhook "pingou", disparado quando o dinheiro cai. Nada além do nome.

O que **não** está publicado, e portanto é desconhecido:

| Tema | Situação |
|---|---|
| Cobrança recorrente, planos, assinatura, Pix Automático | nenhuma menção |
| Ambiente de teste (sandbox), chave de teste | não documentado |
| Identificador da cobrança, QR code, copia e cola, link de pagamento na resposta | não aparecem no exemplo |
| Campo de referência externa, para amarrar a cobrança à organização | não documentado |
| Consulta, cancelamento e estorno de cobrança | não documentado |
| Formato do webhook, lista de eventos, identificador do evento | não documentado |
| Como verificar a autenticidade do webhook | não documentado |
| Retentativas do webhook, limites de taxa, formato de erro | não documentado |

### Consequências para o desenho

1. **Não há recorrência no provedor.** O ciclo mensal é controlado pelo Docverse: cada mês é uma cobrança Pix avulsa, e o pagamento confirmado estende o período. A renovação é manual: a pessoa paga de novo a cada mês.
2. **O contrato da API é presumido.** Todo código que depende do formato da API fica em dois arquivos (`opapingou-client.ts` e `opapingou-webhook.ts`), com cada campo marcado como publicado ou presumido. O resto do sistema só conhece tipos neutros.
3. **A cobrança não pode ser ligada** antes de o fornecedor entregar a documentação e de o contrato presumido ser conferido contra ela.

## Contrato conferido com a documentação do Opa Pingou (2026-09-30)

O Opa Pingou publicou uma referência da API REST na página `/docs` do site (PR #18 do repositório `opapingou/monorepo`, fonte `apps/web/src/content/api-docs.ts` e `api-docs-guides.ts`, commit `dc88159`). A página ainda é uma **prévia**: fica fora do menu e do sitemap, com a faixa "A API REST ainda não está disponível. As rotas e os campos desta página são a proposta atual e podem mudar". A camada `/v1` **não existe** na API deles hoje, que só expõe GraphQL para o app e webhooks de entrada dos bancos. Pontos marcados "A definir" na referência continuam em aberto.

| Tema | Contrato presumido (PR #11) | Documentação (prévia) | Situação no Docverse |
|---|---|---|---|
| URL base | `https://api.opapingou.com.br/v1` | `https://api.opapingou.com.br` + rotas `/v1/...`, marcada como provisória | mantida; URL definitiva e ambientes **A definir** |
| Criar cobrança | `POST /cobranca` | `POST /v1/charges` | ajustado |
| Consultar cobrança | não existia | `GET /v1/charges/{id}` | adotado: é o que confirma o pagamento |
| Autenticação | `Authorization: Bearer <chave>` | chave de API por cliente com escopos (`charges:write`, `charges:read`); o formato do cabeçalho é **A definir** (os exemplos usam `Bearer`) | mantido `Bearer`; a chave precisa dos dois escopos |
| Corpo | form-urlencoded | JSON | ajustado |
| Valor | `valor` decimal em reais (`99.90`) | `amountCents` inteiro em centavos | ajustado |
| Validade | não existia | `validity` obrigatório: `FIFTEEN_MIN`, `ONE_HOUR`, `ONE_DAY`, `SEVEN_DAYS` | `ONE_DAY`, igual à janela de reaproveitamento da cobrança pendente |
| Tipo | não existia | `kind`: `PIX_QR` (padrão) ou `PAYMENT_LINK` (exige Mercado Pago) | `PIX_QR` |
| Referência externa | `referencia` = nosso id | não existe | removida; o nosso id vai no `Idempotency-Key` |
| Descrição | `descricao` | `description` | ajustado |
| Idempotência | não existia | cabeçalho `Idempotency-Key` em `POST /v1/charges`; se é obrigatório, formato e retenção são **A definir** | adotado, com o id da nossa cobrança |
| Resposta: id | `id` (texto ou número) | `id` (UUID) | ajustado |
| Resposta: Pix | `pix_copia_e_cola` | `brCode` (nulo em link de pagamento) | ajustado |
| Resposta: link | `url_pagamento` | `paymentLink` (só `PAYMENT_LINK`) | ajustado; com `PIX_QR` vem nulo e a tela mostra só o copia e cola |
| Resposta: expiração | `expira_em` | `expiresAt` | ajustado |
| Status da cobrança | `"pingou"` = paga | `PENDING`, `PAID`, `EXPIRED`, `CANCELED` | só `PAID` confirma |
| Erros | formato desconhecido | `application/problem+json` (RFC 9457); códigos por erro **A definir** | o corpo do erro continua sem ser lido nem registrado |
| Webhook: existência | evento "pingou" | webhooks de saída, endpoint cadastrado em `/v1/webhook-endpoints` | a URL precisa ser cadastrada por essa rota |
| Webhook: assinatura | `x-opapingou-signature`, HMAC-SHA256 hex do corpo | HMAC com o segredo do endpoint (rota para trocar o segredo); cabeçalho, algoritmo e conteúdo assinado **A definir** | mantida a suposição, isolada em `opapingou-webhook.ts` |
| Webhook: eventos e corpo | `{ id, evento, cobranca: { id, referencia, valor, status } }` | **A definir** | o corpo deixa de ser lido (seção 6) |
| Webhook: retentativas | desconhecido | entregas registradas e reenviáveis (`/v1/webhook-deliveries`); política e tempo limite **A definir** | resposta 5xx quando não dá para consultar o provedor |
| Ambiente de teste | desconhecido | sandbox **A definir**; `POST /v1/charges/{id}/simulate-payment` paga uma cobrança de teste em conta `testMode` | a simulação serve para o teste ponta a ponta |
| Recorrência | nenhuma menção | nenhuma rota de assinatura, plano ou Pix Automático. O repositório só lista a documentação de Pix Automático de cada banco (Inter, C6), sem produto do Opa Pingou em cima disso | segue a renovação manual: uma cobrança Pix avulsa por mês |
| Valor bruto ou líquido | desconhecido | `Charge.amountCents` é o valor da cobrança; `Payment.amountCents` é o bruto e `netCents` o líquido | a conferência usa `Charge.amountCents`, sem risco de rejeitar por tarifa |

### Revisão contra a spec final (2026-10-05)

Referência: `docs/superpowers/specs/2026-10-03-api-rest-keys-webhooks-design.md` e `apps/web/src/content/api-docs.ts` / `api-docs-guides.ts` na `main` do Opa Pingou (`b73c474`). Ela torna definitivos a chave de API, os erros e o webhook de saída. As rotas de cobrança continuam na `/docs`, mas a própria spec as deixa para "outra spec".

| Tema | Definição final | Situação no Docverse |
|---|---|---|
| Autenticação | `Authorization: Bearer opk_live_…` ou `opk_test_…` (a de teste só enxerga contas `testMode`); 401 `API_KEY_INVALID`/`API_KEY_EXPIRED`, 403 `INSUFFICIENT_SCOPE` | já era `Bearer`; nada muda |
| Erros | `application/problem+json` com `code` estável e `requestId` | a mensagem de erro passa a trazer o `code` (só se tiver o formato `A_Z_0_9`), nunca o resto do corpo |
| Webhook: assinatura | `Opa-Signature: t=<unix>,v1=<hex>`, `v1 = HMAC-SHA256(segredo, "<t>.<corpo bruto>")`, segredo `whsec_…`, tolerância de 300 s, comparação em tempo constante | **corrigido**: era `x-opapingou-signature` com HMAC só do corpo |
| Webhook: corpo | `{ id, type, occurredAt, testMode, data: { type, object } }`; `object` é o recurso igual ao da API | **corrigido**: o corpo é lido; `id` vira o id do evento, `charge.paid` traz o id da cobrança em `data.object.id` |
| Webhook: eventos | `payment.*`, `charge.paid`/`expired`/`canceled`, `bank_account.*`, `recurrence.*`, `recurring_charge.*` e `ping` (teste) | só `charge.paid` faz algo; o resto (inclusive `ping`) responde 200 e é ignorado. O endpoint deve assinar só `charge.paid` |
| Webhook: entrega | pelo menos uma vez, deduplicar por `id`; 2xx em até 10 s; 8 tentativas em ≈ 45 h; endpoint desativado depois disso | deduplicação pela tabela de eventos e pela transição condicional da cobrança |
| Rotas de cobrança | `POST /v1/charges` (com `Idempotency-Key`) e `GET /v1/charges/{id}` documentadas, **não implementadas**: o staging responde 404 `NOT_FOUND` | cliente mantido como está; o checkout real depende do Opa Pingou publicar essas rotas |
| Idempotency-Key | obrigatoriedade, formato e retenção ainda "A definir" | mantido, com o id da nossa cobrança |
| Ambientes | staging em `https://api-stg.opapingou.com.br` | apontar `NEXT_PRIVATE_OPAPINGOU_API_URL` para `…/v1` |

## Fora de escopo

- Ligar a cobrança em produção, criar conta ou plano no Opa Pingou, chamar a API real.
- E-mails de lembrete de vencimento e de confirmação de pagamento.
- Nota fiscal, recibo e histórico de faturas para o cliente.
- Estorno e devolução de Pix.
- Tela de administração para conceder ou suspender assinatura manualmente.
- Cobrança por assento, cupom, período de teste, plano anual.
- Religar `IS_BILLING_ENABLED()`. Essa função continua devolvendo `false`: ela aciona travas herdadas do upstream (limite de times, marca, embed) que pressupõem os planos do Stripe.

## Regras

1. **Sala limpa:** código novo, sem ler `packages/ee` nem o billing antigo do histórico.
2. **Segredos só por variável de ambiente**, documentados sem valor no `.env.example`. Nenhum segredo, cabeçalho de autenticação ou corpo de webhook vai para log.
3. **Falha fechada:** sem segredo de webhook configurado, nenhum webhook é aceito. Sem chave de API, o checkout responde erro claro.
4. **Mínima divergência do upstream:** tabelas e arquivos novos; nos arquivos do upstream, só inserções pequenas.

## Design

### 1. Ligar e desligar

| Variável | Uso | Padrão |
|---|---|---|
| `NEXT_PUBLIC_CLOUD_BILLING_ENABLED` | `"true"` liga a cobrança | vazio (desligada) |
| `NEXT_PRIVATE_OPAPINGOU_API_URL` | URL base da API, terminando em `/v1` (sem ele, o `/v1` é acrescentado; staging: `https://api-stg.opapingou.com.br/v1`) | `https://api.opapingou.com.br/v1` |
| `NEXT_PRIVATE_OPAPINGOU_API_KEY` | chave da API | vazio |
| `NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET` | segredo para verificar o webhook | vazio |

`IS_CLOUD_BILLING_ENABLED()` lê a primeira. Por ser `NEXT_PUBLIC_*`, ela chega ao navegador pelo `createPublicEnv()` já existente.

Com a cobrança desligada: o envio nunca é bloqueado, o item "Plano" não aparece no menu, as rotas de cobrança respondem "não encontrado" e o webhook responde 404.

### 2. Modelo de dados

Três tabelas novas. Nenhuma tabela existente muda de coluna; `Organisation` ganha só os campos de relação do Prisma.

```prisma
enum CloudSubscriptionChargeStatus {
  PENDING
  PAID
  EXPIRED
}

model CloudSubscription {
  id                 String   @id @default(cuid())
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime

  organisationId String       @unique
  organisation   Organisation @relation(...)  // onDelete: Cascade
}

model CloudSubscriptionCharge {
  id        String   @id @default(cuid())  // também é a referência enviada ao provedor
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  status      CloudSubscriptionChargeStatus @default(PENDING)
  amountCents Int
  currency    String @default("BRL")

  provider         String
  providerChargeId String?
  paymentUrl       String?
  pixCopyPaste     String?
  expiresAt        DateTime?

  paidAt      DateTime?
  periodStart DateTime?   // período que este pagamento comprou
  periodEnd   DateTime?

  createdByUserId Int?

  organisationId String
  organisation   Organisation @relation(...)  // onDelete: Cascade

  @@unique([provider, providerChargeId])
  @@index([organisationId, status])
}

model CloudBillingWebhookEvent {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  provider  String
  eventId   String   // identificador do evento no provedor, ou SHA-256 do corpo
  eventType String
  outcome   String
  chargeId  String?

  @@unique([provider, eventId])
}
```

Decisões:

- **Sem coluna de status na assinatura.** O estado é derivado de `currentPeriodEnd` na leitura. Assim não existe estado gravado que possa divergir da data, e não é preciso job agendado para vencer assinaturas.
- **A linha de `CloudSubscription` só nasce no primeiro pagamento.** Organização sem linha é organização sem assinatura.
- **Valores em centavos inteiros** (`9990`), para não fazer conta com ponto flutuante. A conversão para o formato do provedor acontece só no adaptador.
- **Tabelas novas em vez de reaproveitar `Subscription`.** O modelo `Subscription` herdado tem formato de Stripe (`planId`, `priceId`, `customerId`) e é lido por telas do upstream que zeram todos os limites quando ele está `INACTIVE`, o que quebraria a premissa P4.

Migração: `20260929120000_add_cloud_billing`, só `CREATE`. Não altera nem apaga dado existente.

### 3. Estado da assinatura

Função pura, usada pelo servidor e pelo navegador (`packages/lib/universal/cloud-billing/subscription-state.ts`):

| Estado | Condição | Pode enviar |
|---|---|---|
| `DISABLED` | cobrança desligada | sim |
| `NONE` | sem assinatura | não |
| `ACTIVE` | agora < fim do período | sim |
| `GRACE` | fim do período ≤ agora < fim + 3 dias | sim |
| `EXPIRED` | agora ≥ fim + 3 dias | não |

`computeNextPeriod({ now, currentPeriodEnd })`: se a assinatura ainda está dentro do período, o novo mês começa no fim do período atual (pagar adiantado não perde dias). Caso contrário, começa agora.

### 4. Adaptador do Opa Pingou

`packages/lib/server-only/cloud-billing/providers/opapingou/`. Cada item abaixo está marcado no código como DOCUMENTED (está na referência, em prévia), UNDECIDED ("A definir" na referência) ou ASSUMED (suposição nossa). Tabela completa das diferenças em "Contrato conferido".

**`opapingou-client.ts`**

- `createOpapingouCharge({ amountCents, description, idempotencyKey })`: `POST {API_URL}/charges` com JSON `{ amountCents, description, validity: "ONE_DAY", kind: "PIX_QR" }` e cabeçalhos `Authorization: Bearer <chave>` e `Idempotency-Key`. Devolve `providerChargeId` (`id`), `pixCopyPaste` (`brCode`), `paymentUrl` (`paymentLink`, só http/https) e `expiresAt`. Uma cobrança criada com valor diferente do pedido vira erro.
- `getOpapingouCharge({ providerChargeId })`: `GET {API_URL}/charges/{id}`, com o id escapado no caminho. Devolve status, `isPaid` (`status === "PAID"`), `amountCents` e `paidAt`. Um 404 devolve `null` (cobrança que o provedor não conhece); qualquer outro erro sobe.

Tempo limite de 10 segundos. Redirecionamento nunca é seguido, porque a requisição leva a chave. Erros viram `AppError` sem ecoar a chave nem o corpo da resposta. A resposta é validada com Zod; resposta fora do formato vira erro, nunca é aceita pela metade.

**`opapingou-webhook.ts` — `verifyOpapingouWebhookSignature` e `parseOpapingouWebhookNotification`**

| Item | Valor | Origem |
|---|---|---|
| Assinatura | HMAC com o segredo do endpoint | documentado |
| Cabeçalho | `Opa-Signature: t=<unix>,v1=<hex>` | definitivo (spec do Opa Pingou §6.4) |
| Algoritmo | HMAC-SHA256 de `"<t>.<corpo bruto>"`, em hexadecimal; aceita vários `v1` | definitivo |
| Tolerância | `|agora − t|` até 300 s | definitivo |
| Corpo | `{ id, type, occurredAt, testMode, data: { type, object } }` | definitivo |
| Identificador do evento | `id` do corpo, repetido no cabeçalho `Opa-Event-Id` | definitivo |
| Tipo do evento | `type` do corpo, repetido no cabeçalho `Opa-Event-Type` | definitivo |

A comparação usa `crypto.timingSafeEqual`. Sem segredo configurado, a verificação sempre falha.

### 5. Início do checkout

`createCloudSubscriptionCheckout({ organisationId, userId })`:

1. Exige cobrança ligada e chave configurada.
2. Marca como `EXPIRED` as cobranças pendentes já vencidas da organização.
3. Se existe cobrança `PENDING` válida, criada há menos de 24 horas, **devolve a mesma** (clicar duas vezes não gera duas cobranças).
   - Exceção: com `isReplacement`, a cobrança pendente é marcada `EXPIRED` e uma nova é criada. É a saída para quando o código Pix deixou de funcionar. Se a cobrança substituída acabar sendo paga, o pagamento é aceito.
   - Dois checkouts simultâneos da mesma organização são serializados por uma trava (`pg_advisory_xact_lock`). O segundo recebe "já existe um pagamento sendo preparado".
4. Senão, cria a linha `PENDING`, chama o provedor com `Idempotency-Key = id da linha` e grava o retorno. Se o provedor falhar, a linha é apagada e o erro sobe. Uma nova tentativa com a mesma linha não cria segunda cobrança no provedor.

Rotas tRPC (`packages/trpc/server/billing-router/`), as duas restritas a quem tem `MANAGE_BILLING` (administradores da organização):

- `billing.getSubscription({ organisationId })`: estado, preço, datas do período e cobrança pendente.
- `billing.createCheckout({ organisationId })`: devolve a cobrança com o código Pix (o link vem vazio em `PIX_QR`).

### 6. Webhook

`POST /api/billing/opapingou/webhook` (Hono, `apps/remix/server/api/billing/webhook.ts`). A rota só repassa corpo bruto e cabeçalhos para `handleOpapingouWebhook`, em `packages/lib`, onde está a lógica e onde ficam os testes.

O corpo autêntico diz qual cobrança foi paga (`charge.paid`, `data.object.id`), mas não é a fonte do status nem do valor: quem confirma o pagamento é a API (`GET /v1/charges/{id}`), a mesma regra que o próprio Opa Pingou aplica aos webhooks que recebe dos bancos. A conta do Opa Pingou pode ter cobranças de outros sistemas: uma cobrança que não é nossa não gera consulta nenhuma.

Ordem das verificações:

1. Cobrança desligada → 404.
2. Corpo maior que 64 KB → 413. O corpo é lido do stream com corte, então um envio sem tamanho declarado também para no limite.
3. Assinatura ausente, inválida ou fora da tolerância de 300 s → 401. Nada é lido nem gravado.
4. Corpo fora do formato (sem `id` ou `type`), `charge.paid` sem `data.object.id`, ou `Opa-Event-Id`/`Opa-Event-Type` diferentes do `id`/`type` do corpo → 400. Os cabeçalhos não entram na assinatura: vale o corpo, e um cabeçalho que discorda dele é recusado; sem os cabeçalhos, o corpo basta.
4a. Evento já registrado como `PROCESSED` (mesmo `Opa-Event-Id`) → 200 `ALREADY_PROCESSED`, sem consultar a API de novo. Um evento registrado com outro resultado é tratado de novo, o que é seguro.
5. Evento diferente de `charge.paid` (inclusive `ping`) → grava o evento com `IGNORED` e responde 200.
6. `confirmCloudSubscriptionCharges({ providerChargeId })`: busca a cobrança do Docverse com esse `providerChargeId`, status `PENDING` ou `EXPIRED` e criada nos últimos 2 dias (a cobrança vale 1 dia e as retentativas do Opa Pingou duram ≈ 45 h). Se não existe, nada é consultado (`NOTHING_TO_CONFIRM`). Sem `providerChargeId`, a função lê todas as recentes (no máximo 25), para uma consulta manual futura. Para cada uma, da mais antiga para a mais nova:
   - o provedor não conhece a cobrança (404) → `UNKNOWN_TO_PROVIDER`, pulada;
   - status diferente de `PAID` → `NOT_PAID`;
   - `amountCents` do provedor diferente do valor da cobrança → `REJECTED_AMOUNT_MISMATCH`, nada é ativado;
   - senão, em uma transação com trava por organização: muda a cobrança para `PAID` com `updateMany ... WHERE status IN (PENDING, EXPIRED)`. Se nenhuma linha mudou, outra entrega já confirmou → `ALREADY_PAID`. Senão, cria ou estende `CloudSubscription` com `computeNextPeriod` → `PROCESSED`.
7. Se alguma consulta ao provedor falhou (fora do 404), as cobranças que deram certo ficam aplicadas e o erro sobe: a rota responde 500 e o provedor reentrega.
8. Grava `CloudBillingWebhookEvent` com `eventId` = `id` do evento, `eventType` = `type` e o resultado (`PROCESSED`, `REJECTED_AMOUNT_MISMATCH`, `NOTHING_TO_CONFIRM` ou `IGNORED`). A reentrega do mesmo evento mantém o primeiro registro. Responde 200.

**Autenticidade** tem duas camadas: a assinatura HMAC, que decide se o Docverse vai consultar o provedor; e a consulta autenticada à API, que é a única fonte do status e do valor. Um corpo que diz "pago" sem o provedor confirmar não ativa nada.

**Idempotência** começa pelo id do evento (passo 4a), que poupa a consulta à API numa reentrega, mas a garantia está na transição condicional da cobrança: reentregas, entregas diferentes sobre o mesmo pagamento e entregas simultâneas concedem um único mês.

Uma cobrança substituída pelo usuário (`EXPIRED` do nosso lado) ainda é consultada: se o dinheiro entrou, o pagamento é aceito.

O log registra id da entrega, resultado e id da cobrança. Nunca o corpo, a assinatura ou o segredo.

### 7. Ligação com o módulo de limites

`TLimitsResponse` ganha o campo `subscription: { state, isSendingAllowed }`.

- **Servidor:** `getServerLimits` passa a devolver o estado da assinatura da organização do time.
- **Navegador:** a sessão da organização passa a trazer `cloudSubscription.currentPeriodEnd`; o layout do time calcula o estado com a mesma função pura e entrega ao `LimitsProvider`.
- As cotas (`documents`, `recipients`, `directTemplates`) **continuam ilimitadas**. É o que garante a premissa P4: quem não assinou ainda cria e edita.

Trava no servidor, `assertOrganisationCanSendDocuments({ teamId })`, chamada em:

- `sendDocument` (cobre distribuir, usar modelo com envio, envio em massa e API v1/v2);
- `resendDocument`;
- `createDocumentFromDirectTemplate`, como última barreira;
- os loaders das páginas de modelo direto (`/d/:token` e o embed), que respondem "não encontrado" **antes** de mostrar o formulário, para o signatário externo não preencher um documento que vai falhar no fim;
- "usar modelo e enviar" e envio em massa, **antes** de criar o rascunho, para não deixar documento criado e não enviado;
- o job de lembrete de assinatura, que pula o envio (P10).

Lança `AppError('SUBSCRIPTION_REQUIRED')` com status 402. Com a cobrança desligada, retorna sem consultar o banco.

Como o erro chega a quem integra: 402 no tRPC e na API v2. Na API v1, que está descontinuada e cujo contrato não declara 402, chega como 400 com a mensagem preservada.

Interface:

- Faixa no topo do app para organização que não pode enviar, com botão "Ver plano" para quem administra a cobrança.
- Mensagem de erro traduzida para `SUBSCRIPTION_REQUIRED`.

### 8. Tela de plano

Rota `/o/:orgUrl/settings/billing`, item "Plano" no menu de configurações da organização. Aparece só com a cobrança ligada e para quem tem `MANAGE_BILLING`.

Conteúdo:

- nome do plano, preço (R$ 99,90 por mês) e o que inclui;
- estado atual, com a data de validade;
- botão "Assinar" ou "Renovar";
- com cobrança pendente: link de pagamento, código Pix copia e cola com botão de copiar, botão "Já paguei" e botão "Gerar novo código".

"Já paguei" só confirma quando o período pago **avançou**. O estado do plano não serve de critério: quem renova antes do vencimento já está ativo, tenha pago ou não.

O caminho `/settings/billing` é o mesmo que os links residuais do upstream já usam.

### 9. Seção de planos da landing page

Em PR separado (`docverse/landing-pricing`), independente deste. A landing page (DOC-29) ainda não existe na `main` e está sendo feita em outra branch, então a entrega é um componente isolado, pronto para ser encaixado.

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Cobrança ligada, chave ausente | checkout responde `NOT_SETUP`; a tela avisa que a cobrança não está configurada |
| Provedor fora do ar ou lento | tempo limite de 10 s; erro genérico para a pessoa, detalhe sem segredo no log |
| Resposta do provedor fora do formato | erro; nenhuma cobrança fica gravada |
| Webhook com assinatura inválida | 401, nada gravado |
| Webhook repetido | 200, sem efeito |
| Pagamento de cobrança já vencida | aceito: o dinheiro entrou, o período é concedido |
| Valor pago diferente | rejeitado e registrado para conferência manual |

## Testes

Nenhum teste chama a API real.

- **Funções puras:** estado da assinatura, cálculo do período, formatação de valores, verificação de assinatura do webhook, leitura da entrega.
- **API simulada:** servidor HTTP local (`node:http`, em `127.0.0.1`) que implementa `POST /v1/charges` (com `Idempotency-Key`) e `GET /v1/charges/{id}` da referência, e deixa o teste mudar o status e o valor de uma cobrança. Cobre sucesso, 401, 404, 500, `problem+json`, resposta inválida, formato antigo recusado, tempo limite e redirecionamento, e confere que a chave vai no cabeçalho e não aparece em mensagem de erro.
- **Integração com banco:** Postgres descartável, ligado por `CLOUD_BILLING_TEST_DATABASE_URL`. Sem a variável, esses testes são pulados. Cobre checkout, reaproveitamento de cobrança pendente, confirmação pelo provedor, corpo que alega pagamento sem confirmação, cobrança expirada ou cancelada no provedor, entrega repetida e simultânea, valor divergente, provedor fora do ar, cobrança desconhecida pelo provedor e renovação. O arquivo do webhook usa datas de 2027 para não ler cobranças dos outros arquivos, que rodam em paralelo no mesmo banco.
- **Migração:** aplicada do zero no Postgres descartável, com conferência de que o schema não diverge das migrações.

## O que falta para ligar a cobrança

1. Confirmar as premissas P1 a P10.
2. **O Opa Pingou publicar `POST /v1/charges` e `GET /v1/charges/{id}`.** Chave, erros e webhooks já estão no ar (2026-10-05); as rotas de cobrança ainda respondem 404 no staging.
3. Conferir quando as rotas de cobrança saírem: `Idempotency-Key` (obrigatório? retenção?), URL base definitiva e se os campos de `Charge` mudaram.
4. Recorrência: a documentação não tem assinatura nem Pix Automático. Decidir se a renovação manual mensal por Pix é aceitável ou se é preciso pedir recorrência ao Opa Pingou ou usar outro provedor.
5. Criar a conta, conectar um banco e gerar uma chave de API com `charges:write` e `charges:read` (mais `webhooks:write` se o endpoint for cadastrado pela API), e um endpoint de webhook inscrito só em `charge.paid` apontando para `/api/billing/opapingou/webhook`, com o segredo `whsec_…` guardado em `NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET`.
6. Testar ponta a ponta fora de produção: sandbox, se o Opa Pingou criar um, ou uma conta `testMode` com `POST /v1/charges/{id}/simulate-payment`; depois uma cobrança real de valor baixo.
7. Definir as variáveis de ambiente em produção e aplicar a migração.
8. Decidir o que acontece com as organizações que já existem na instância cloud quando a cobrança for ligada.
9. Criar alerta para pagamento rejeitado por valor divergente: hoje ele só aparece no log e na tabela de eventos.
10. Repassar as quatro variáveis novas ao ambiente de produção (compose e segredos do deploy).
11. Opcional: um botão "já paguei" ou uma consulta ao abrir a tela de plano que chame `confirmCloudSubscriptionCharges`, para o pagamento ser confirmado mesmo se o webhook atrasar.
