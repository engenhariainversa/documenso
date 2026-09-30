# Lista de espera na landing page (DOC-31)

Data: 2026-09-29. Card: DOC-31. Decisão de origem: DOC-21 ("em vez de só fechar o cadastro público, deixar uma waitlist na landing page").

## Objetivo

Quando o cadastro público do Docverse estiver fechado, o visitante da landing page deixa nome, e-mail e telefone numa lista de espera. A pessoa que administra a instância vê a lista no admin, exporta em CSV, exclui inscrições e convida inscritos, que recebem um link para definir a senha e entram com uma organização pessoal, como quem se cadastra pelo formulário normal.

O modelo é o da lista de espera do termhub (tabela própria, formulário público com campo-isca e limite por IP, aba de administração com listar, excluir e convidar). O código é novo e AGPL; nada vem de `packages/ee` nem é copiado do termhub.

## Decisões da pessoa (2026-09-29/30)

| Ponto | Decisão |
|---|---|
| Gatilho | Variável própria `NEXT_PUBLIC_WAITLIST_ENABLED`, independente do cadastro |
| Armazenamento | Tabela nova no Postgres e tela em `/admin/waitlist` |
| Aviso | E-mail para a pessoa a cada inscrição e e-mail de confirmação para o inscrito |
| Campos | Nome, e-mail e telefone |
| Convite | Pelo admin, como a aba Waitlist do termhub |
| LGPD | Caixa de consentimento obrigatória, com data e versão do texto gravadas |
| Spam e duplicidade | Proteção completa: campo-isca, limite por IP e global, e-mail descartável bloqueado, Turnstile quando configurado, e-mail repetido recebe a mesma resposta de sucesso |
| Idiomas | pt-BR e inglês, seguindo a landing (assumido; a landing já é bilíngue) |

## Comportamento na landing

| `NEXT_PUBLIC_WAITLIST_ENABLED` | Cadastro público | Resultado |
|---|---|---|
| vazia ou diferente de `true` | qualquer | Nada muda em relação a hoje |
| `true` | fechado | O botão "Criar conta" (cabeçalho e topo) vira "Entrar na lista de espera" e leva à seção `#waitlist`. O botão do plano na seção de preços também leva a `#waitlist` |
| `true` | aberto | "Criar conta" continua; a seção da lista de espera aparece abaixo dos recursos |

"Cadastro fechado" é o mesmo `isSignupEnabled` que a landing já calcula: `NEXT_PUBLIC_DISABLE_SIGNUP=true` ou todos os métodos de cadastro desligados.

A seção `#waitlist` tem título, um parágrafo curto e o formulário. Fica entre a seção de recursos e a de planos.

## Formulário

Campos, na ordem:

1. Nome (obrigatório, 1 a 100 caracteres; mesma regra `ZNameSchema` do cadastro).
2. E-mail (obrigatório, validado como o cadastro; normalizado em minúsculas).
3. Telefone em três campos, como no termhub: DDI (1 a 4 dígitos, sem zeros à esquerda, padrão 55 em pt-BR e 1 em inglês), DDD (1 a 5 dígitos) e número (6 a 12 dígitos). O servidor grava só o valor normalizado E.164 (`+5562999999999`).
4. Caixa de consentimento, obrigatória.
5. Campo-isca `website`, invisível e fora da ordem de foco; se vier preenchido, o servidor responde sucesso sem gravar.
6. Turnstile, quando `NEXT_PUBLIC_TURNSTILE_SITE_KEY` estiver definida (mesmo componente do cadastro).

Texto do consentimento, versão `2026-09-29`:

- pt-BR: "Concordo que o Docverse guarde meu nome, e-mail e telefone para me avisar quando o acesso for liberado. Posso pedir a remoção a qualquer momento."
- en: "I agree that Docverse stores my name, email and phone number to let me know when access opens. I can ask for removal at any time."

Abaixo da caixa, quando as variáveis existirem: link "Política de privacidade" (`NEXT_PUBLIC_PRIVACY_URL`) e "Para pedir a remoção, escreva para <e-mail>" (`NEXT_PUBLIC_SUPPORT_EMAIL`). Sem as variáveis, essas frases não aparecem.

Estados: enviando (botão desabilitado), sucesso ("Você está na lista. Vamos avisar por e-mail quando o acesso for liberado."), erro genérico ("Não foi possível registrar. Tente de novo em alguns minutos.") e erro de limite ("Muitas tentativas deste endereço. Tente de novo mais tarde."). O sucesso é o mesmo para inscrição nova e repetida.

Os textos do formulário ficam em `LANDING_COPY`, como o resto da landing. Os textos de e-mail e do admin usam o Lingui, como o resto do app, com tradução pt-BR no catálogo.

## Dados

Modelo Prisma `WaitlistEntry` (tabela `WaitlistEntry`, seguindo a convenção do repositório, sem `@@map`):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `name` | `String` | |
| `email` | `String @unique` | minúsculas |
| `phone` | `String` | E.164 |
| `locale` | `String` | `pt-BR` ou `en`; idioma do formulário e dos e-mails |
| `source` | `String @default("landing")` | |
| `consentVersion` | `String` | versão do texto aceito |
| `consentedAt` | `DateTime` | |
| `createdAt` | `DateTime @default(now())` | índice |
| `invitedAt` | `DateTime?` | último convite enviado |
| `invitedUserId` | `Int?` | usuário criado ou reaproveitado no convite; sem chave estrangeira, para a exclusão do usuário não depender da lista |

Migração `20260930000000_add_waitlist_entry`: só `CREATE TABLE`, `CREATE UNIQUE INDEX` e `CREATE INDEX`.

O IP não é gravado na inscrição. Ele entra só como chave da tabela `RateLimit`, que já existe e já expira.

## Servidor

### `waitlist.join` (tRPC, procedimento público)

Entrada: `name`, `email`, `phoneCountry`, `phoneArea`, `phoneNumber`, `locale`, `consent: true`, `consentVersion`, `website?` (isca), `captchaToken?`.

Ordem das verificações:

1. `NEXT_PUBLIC_WAITLIST_ENABLED !== 'true'` → erro `NOT_FOUND` ("A lista de espera não está ativa").
2. Limite por IP: 5 inscrições por hora por IP, 100 por hora no total (`createRateLimit({ action: 'waitlist.join', max: 5, globalMax: 100, window: '1h' })`). Estourou → `TOO_MANY_REQUESTS`.
3. Isca preenchida → resposta de sucesso, sem gravar e sem e-mail.
4. Turnstile: `verifyCaptcha(captchaToken)` quando a chave secreta estiver configurada (mesma função do cadastro). Falhou → `BAD_REQUEST`.
5. E-mail com domínio descartável (`isEmailDomainBlocked`, a mesma verificação do cadastro) → `BAD_REQUEST` com código próprio, para a landing mostrar "Use um e-mail permanente".
6. E-mail já na lista → resposta de sucesso, sem gravar e sem e-mail.
7. Grava a inscrição e dispara o job `send.waitlist.joined.emails` com o id da inscrição.

Resposta: `{ ok: true }` em todos os casos de sucesso. Nada na resposta distingue inscrição nova de repetida.

### Job `send.waitlist.joined.emails`

1. E-mail de confirmação para o inscrito, no idioma da inscrição: assunto "Você está na lista de espera do Docverse"; corpo com o que foi guardado (nome, e-mail, telefone), aviso de que a pessoa receberá um e-mail quando o acesso for liberado e como pedir a remoção (`NEXT_PUBLIC_SUPPORT_EMAIL` quando existir).
2. Se `NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL` estiver preenchida: e-mail de aviso para esse endereço, em pt-BR, com nome, e-mail, telefone, idioma, data e link para `/admin/waitlist`.

Falha de SMTP não desfaz a inscrição; o job tem a retentativa padrão do sistema de jobs.

### Rotas do admin (`admin.waitlist.*`, `adminProcedure`)

- `find`: busca por nome ou e-mail, paginação, ordem por data decrescente. Cada linha traz também se já existe usuário com aquele e-mail.
- `export`: CSV com todas as linhas (nome, e-mail, telefone, idioma, consentimento, data, convite).
- `delete`: exclui uma inscrição. É como um pedido de remoção (LGPD) é atendido.
- `invite`: recebe uma lista de ids (1 a 100). Para cada inscrição:
  - se não existe usuário com o e-mail: cria o usuário sem senha e com e-mail verificado, cria a organização pessoal (`onCreateUserHook`), grava `invitedUserId` e dispara o job `send.waitlist.invite.email`;
  - se já existe: grava `invitedUserId`, marca `invitedAt` e devolve `existing: true`, sem e-mail.
  - Falha em uma inscrição não interrompe as outras; o resultado é por inscrição.

Convidar cria conta mesmo com o cadastro público fechado, porque não passa pela rota de cadastro.

### Job `send.waitlist.invite.email`

Cria um `PasswordResetToken` com validade de 7 dias e envia, no idioma da inscrição, o e-mail "Seu acesso ao Docverse foi liberado" com o link `/reset-password/<token>`. O texto avisa que, se o link vencer, basta usar "Esqueci minha senha" na tela de entrada.

## Admin: `/admin/waitlist`

Item "Lista de espera" no menu do admin, depois de "Usuários". A página tem:

- campo de busca (nome ou e-mail);
- tabela com nome, e-mail, telefone, idioma, data da inscrição, convite (data ou "não convidado"; "já tinha conta" quando houver usuário e não houver convite);
- seleção por linha e botão "Convidar selecionados", com confirmação e resumo do resultado;
- por linha: convidar (ou reenviar) e excluir, com confirmação;
- botão "Exportar CSV".

## Variáveis de ambiente

| Variável | Uso | Padrão |
|---|---|---|
| `NEXT_PUBLIC_WAITLIST_ENABLED` | Liga a lista de espera na landing e a rota pública | desligada |
| `NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL` | Destino do aviso a cada inscrição | vazio: sem aviso |
| `NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL` | Já existem; alimentam o texto de consentimento | |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PRIVATE_TURNSTILE_SECRET_KEY` | Já existem; ligam o Turnstile no formulário | |

As duas novas entram em `.env.example`, `turbo.json`, `process-env.d.ts`, `docker/production/compose.yml` e no compose do Docverse.

## Testes

- Unitários (Vitest): esquema de entrada e normalização do telefone; regras da rota pública (desligada, isca, limite, descartável, repetido, sucesso) com o Prisma e os jobs substituídos por dublês; regra de visibilidade da landing (`isWaitlistEnabled`, qual botão aparece).
- Tipos (`tsc`), lint (Biome) e build do app Remix.
- Verificação manual opcional, se sobrar tempo: subir o app em container descartável (`tmp-*`) e enviar o formulário.

## Fora de escopo

Deploy, alteração de `.env.prod`, banco ou containers de produção; PR 3 (BirdID); qualquer coisa em `packages/ee`; convite automático; fila de posição na lista; exportação em outros formatos.

## Para ligar em produção (depois do merge)

1. `NEXT_PUBLIC_WAITLIST_ENABLED=true` e `NEXT_PUBLIC_DISABLE_SIGNUP=true` no `.env.prod`.
2. `NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL` com o endereço que recebe o aviso.
3. `NEXT_PUBLIC_PRIVACY_URL` e `NEXT_PUBLIC_SUPPORT_EMAIL`, para o texto de consentimento ficar completo.
4. Opcional: chaves do Turnstile.
5. Migração roda no deploy. Lembrar da lição: editar o `.env.prod` recria o container `docverse-db` no próximo `compose up`.
