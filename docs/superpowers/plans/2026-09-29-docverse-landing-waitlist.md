# Lista de espera na landing page — plano de implementação (DOC-31)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com `NEXT_PUBLIC_WAITLIST_ENABLED=true`, a landing page do Docverse recebe inscrições (nome, e-mail, telefone, consentimento) numa lista de espera que a pessoa administra em `/admin/waitlist`, de onde exporta, exclui e convida os inscritos.

**Architecture:** Tabela nova `WaitlistEntry` no Prisma; regras de negócio em `packages/lib/server-only/waitlist/` (funções puras testáveis com o Prisma e os jobs como dublês); rota pública `waitlist.join` e rotas `admin.waitlist.*` no tRPC; dois jobs de e-mail; formulário na landing (`apps/remix/app/components/docverse/`) e página no admin. Nada em `packages/ee`.

**Tech Stack:** React Router 7 (Remix), tRPC, Prisma/Postgres, Zod, Lingui (admin e e-mails), Vitest, Biome, `@marsidev/react-turnstile`.

**Spec:** `docs/superpowers/specs/2026-09-29-docverse-landing-waitlist-design.md`

## Global Constraints

- Código novo, AGPL; nenhum import de `packages/ee`; nenhum código copiado do termhub (só o modelo).
- Migração só com `CREATE TABLE`, `CREATE UNIQUE INDEX` e `CREATE INDEX`.
- Variáveis novas: `NEXT_PUBLIC_WAITLIST_ENABLED` e `NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL`; entram em `.env.example`, `turbo.json`, `packages/tsconfig/process-env.d.ts` e `docker/production/compose.yml` (o compose do Docverse usa `env_file`, não precisa de linha).
- Textos da landing em `LANDING_COPY` (pt-BR e en). Textos do admin e dos e-mails com Lingui (`msg`/`Trans`), com tradução pt-BR acrescentada em `packages/lib/translations/pt-BR/web.po` depois de `npm run translate:extract`.
- Versão do consentimento: a constante `WAITLIST_CONSENT_VERSION = '2026-09-29'`.
- Resposta da rota pública é `{ ok: true }` para inscrição nova, repetida e isca preenchida.
- O IP nunca é gravado em `WaitlistEntry`.
- Commits com conventional commits (o hook do commitlint exige tipo e assunto). Antes de rodar testes num worktree novo: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`, `cp .env.example .env`, `npm run prisma:generate`, `npm run translate:compile` (lições DOC-29/DOC-30).

## Review Focus

1. Telefone com DDI começando em zero ou com espaços/pontos: o servidor deve normalizar para E.164 sem zeros à esquerda no DDI e sem separadores → teste em `normalize-phone.test.ts` (Task 2).
2. E-mail com maiúsculas ou espaços ("  Ana@Exemplo.com ") repetido de uma inscrição anterior em minúsculas: deve ser tratado como repetido, sem gravar e sem e-mail → teste em `join-waitlist.test.ts` (Task 3).
3. `NEXT_PUBLIC_WAITLIST_ENABLED` com valor diferente de `true` (por exemplo `1` ou `TRUE`): lista desligada; a landing não mostra o formulário e a rota responde `NOT_FOUND` → testes em `landing-waitlist.test.ts` (Task 1) e `join-waitlist.test.ts` (Task 3).
4. Convite de um inscrito cujo e-mail já tem conta: nada de novo é criado, nenhum e-mail sai, o resultado diz `existing: true` e `invitedAt` é marcado → teste em `invite-waitlist-entries.test.ts` (Task 6).
5. Falha de SMTP ao enviar a confirmação: a inscrição já está gravada e o job falha sozinho; a rota nunca aguarda o envio → `joinWaitlist` só chama `jobsClient.triggerJob` (dublê no teste) e a asserção verifica que a gravação vem antes (Task 3).

---

### Task 1: Flag e regra de visibilidade da landing

**Files:**
- Create: `packages/lib/utils/landing-waitlist.ts`
- Create: `packages/lib/utils/landing-waitlist.test.ts`
- Modify: `packages/tsconfig/process-env.d.ts` (perto de `NEXT_PUBLIC_DISABLE_SIGNUP`)
- Modify: `turbo.json` (lista `globalEnv`, perto de `NEXT_PUBLIC_DISABLE_SIGNUP`)
- Modify: `.env.example` (perto de `NEXT_PUBLIC_DISABLE_SIGNUP`)
- Modify: `docker/production/compose.yml` (perto de `NEXT_PUBLIC_DISABLE_SIGNUP`)

**Interfaces:**
- Produces: `isWaitlistEnabled(): boolean`; `WAITLIST_CONSENT_VERSION = '2026-09-29'`; `getLandingSignupAction({ isSignupEnabled, isWaitlistEnabled }): 'signup' | 'waitlist' | 'none'`.

- [ ] **Step 1: Teste**

```ts
// packages/lib/utils/landing-waitlist.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLandingSignupAction, isWaitlistEnabled, WAITLIST_CONSENT_VERSION } from './landing-waitlist';

describe('isWaitlistEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off by default', () => {
    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', '');
    expect(isWaitlistEnabled()).toBe(false);
  });

  it('is only on for the literal "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', 'true');
    expect(isWaitlistEnabled()).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', 'TRUE');
    expect(isWaitlistEnabled()).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_WAITLIST_ENABLED', '1');
    expect(isWaitlistEnabled()).toBe(false);
  });
});

describe('getLandingSignupAction', () => {
  it('keeps the signup button when signup is open, whatever the waitlist flag', () => {
    expect(getLandingSignupAction({ isSignupEnabled: true, isWaitlistEnabled: false })).toBe('signup');
    expect(getLandingSignupAction({ isSignupEnabled: true, isWaitlistEnabled: true })).toBe('signup');
  });

  it('points to the waitlist when signup is closed and the waitlist is on', () => {
    expect(getLandingSignupAction({ isSignupEnabled: false, isWaitlistEnabled: true })).toBe('waitlist');
  });

  it('shows nothing when signup is closed and the waitlist is off', () => {
    expect(getLandingSignupAction({ isSignupEnabled: false, isWaitlistEnabled: false })).toBe('none');
  });
});

describe('WAITLIST_CONSENT_VERSION', () => {
  it('is a date', () => {
    expect(WAITLIST_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run utils/landing-waitlist` em `packages/lib`. Esperado: falha por módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// packages/lib/utils/landing-waitlist.ts
import { env } from './env';

/**
 * Version of the consent text shown on the waitlist form. Bump it whenever the text
 * changes, so each entry records which wording the person agreed to.
 */
export const WAITLIST_CONSENT_VERSION = '2026-09-29';

/**
 * The waitlist is opt-in per instance and independent from the signup switches.
 */
export const isWaitlistEnabled = () => env('NEXT_PUBLIC_WAITLIST_ENABLED') === 'true';

export type LandingSignupAction = 'signup' | 'waitlist' | 'none';

/**
 * Which call to action the landing shows in place of "Create account".
 */
export const getLandingSignupAction = ({
  isSignupEnabled,
  isWaitlistEnabled,
}: {
  isSignupEnabled: boolean;
  isWaitlistEnabled: boolean;
}): LandingSignupAction => {
  if (isSignupEnabled) {
    return 'signup';
  }

  return isWaitlistEnabled ? 'waitlist' : 'none';
};
```

Nas configurações: `NEXT_PUBLIC_WAITLIST_ENABLED?: string;` e `NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL?: string;` em `process-env.d.ts`; as duas em `turbo.json`; em `.env.example`, bloco:

```
# [[WAITLIST]]
# OPTIONAL: Set to "true" to show a waitlist form on the landing page. Meant for an
# instance whose public signup is closed (NEXT_PUBLIC_DISABLE_SIGNUP=true).
NEXT_PUBLIC_WAITLIST_ENABLED=
# OPTIONAL: Address that receives an email for each new waitlist entry. Empty = no notice.
NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL=
```

Em `docker/production/compose.yml`: `- NEXT_PUBLIC_WAITLIST_ENABLED=${NEXT_PUBLIC_WAITLIST_ENABLED}` e `- NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL=${NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL}`.

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `feat(waitlist): flag NEXT_PUBLIC_WAITLIST_ENABLED e regra do botão da landing (DOC-31)`.

---

### Task 2: Modelo, migração e esquema de entrada

**Files:**
- Modify: `packages/prisma/schema.prisma` (depois de `model RateLimit`)
- Create: `packages/prisma/migrations/20260930000000_add_waitlist_entry/migration.sql`
- Create: `packages/lib/server-only/waitlist/normalize-phone.ts`
- Create: `packages/lib/server-only/waitlist/normalize-phone.test.ts`
- Create: `packages/trpc/server/waitlist-router/join-waitlist.types.ts`
- Create: `packages/trpc/server/waitlist-router/join-waitlist.types.test.ts`

**Interfaces:**
- Produces: modelo `WaitlistEntry`; `normalizeWaitlistPhone({ country, area, number }): string` (E.164); `ZJoinWaitlistRequestSchema`, `TJoinWaitlistRequest`, `ZJoinWaitlistResponseSchema = z.object({ ok: z.literal(true) })`; `WAITLIST_LOCALES = ['pt-BR', 'en'] as const`.

- [ ] **Step 1: Modelo Prisma**

```prisma
/// Docverse: sign-ups from the landing page waitlist, shown when public signup is closed.
model WaitlistEntry {
  id             String    @id @default(cuid())
  name           String
  email          String    @unique
  /// E.164, e.g. "+5562999999999"
  phone          String
  /// Language of the form and of the emails: "pt-BR" or "en"
  locale         String
  source         String    @default("landing")
  consentVersion String
  consentedAt    DateTime
  createdAt      DateTime  @default(now())
  /// Last invite sent from the admin; null = not invited yet
  invitedAt      DateTime?
  /// User created (or found) by the invite. No relation on purpose: deleting the user must not depend on the waitlist.
  invitedUserId  Int?

  @@index([createdAt])
}
```

Migração:

```sql
-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedAt" TIMESTAMP(3),
    "invitedUserId" INTEGER,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE INDEX "WaitlistEntry_createdAt_idx" ON "WaitlistEntry"("createdAt");
```

Rodar `npm run prisma:generate` e conferir com `npx prisma migrate diff --from-migrations packages/prisma/migrations --to-schema-datamodel packages/prisma/schema.prisma --shadow-database-url <banco descartável>` se houver banco local; senão, conferir a olho contra o SQL que o Prisma gera para modelos parecidos (`RateLimit`).

- [ ] **Step 2: Teste do telefone**

```ts
// normalize-phone.test.ts
import { describe, expect, it } from 'vitest';

import { normalizeWaitlistPhone } from './normalize-phone';

describe('normalizeWaitlistPhone', () => {
  it('joins the three parts into E.164', () => {
    expect(normalizeWaitlistPhone({ country: '55', area: '62', number: '999999999' })).toBe('+5562999999999');
  });

  it('drops leading zeros of the country code and separators in every part', () => {
    expect(normalizeWaitlistPhone({ country: '055', area: '(62)', number: '99999-9999' })).toBe('+5562999999999');
  });

  it('refuses a part without digits', () => {
    expect(() => normalizeWaitlistPhone({ country: '', area: '62', number: '999999999' })).toThrow();
  });
});
```

- [ ] **Step 3: Implementar**

```ts
// normalize-phone.ts
const onlyDigits = (value: string) => value.replace(/\D+/g, '');

/**
 * Builds the E.164 form from the three fields of the form. Validation of lengths lives
 * in the request schema; this only normalises.
 */
export const normalizeWaitlistPhone = ({ country, area, number }: { country: string; area: string; number: string }) => {
  const countryDigits = onlyDigits(country).replace(/^0+/, '');
  const areaDigits = onlyDigits(area);
  const numberDigits = onlyDigits(number);

  if (!countryDigits || !areaDigits || !numberDigits) {
    throw new Error('Phone parts must contain digits');
  }

  return `+${countryDigits}${areaDigits}${numberDigits}`;
};
```

- [ ] **Step 4: Esquema de entrada e teste**

```ts
// join-waitlist.types.ts
import { ZNameSchema } from '@documenso/lib/types/name';
import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

export const WAITLIST_LOCALES = ['pt-BR', 'en'] as const;

const zDigits = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\D+/g, ''))
    .pipe(z.string().min(min).max(max));

export const ZJoinWaitlistRequestSchema = z.object({
  name: ZNameSchema,
  email: zEmail().trim().toLowerCase().max(254),
  phoneCountry: zDigits(1, 4),
  phoneArea: zDigits(1, 5),
  phoneNumber: zDigits(6, 12),
  locale: z.enum(WAITLIST_LOCALES),
  consent: z.literal(true),
  consentVersion: z.string().min(1).max(20),
  /** Honeypot: people never see it, bots fill it. */
  website: z.string().max(200).optional(),
  captchaToken: z.string().trim().optional(),
});

export type TJoinWaitlistRequest = z.infer<typeof ZJoinWaitlistRequestSchema>;

export const ZJoinWaitlistResponseSchema = z.object({ ok: z.literal(true) });

export type TJoinWaitlistResponse = z.infer<typeof ZJoinWaitlistResponseSchema>;
```

Teste `join-waitlist.types.test.ts` (roda com o Vitest de `packages/trpc`? Se `packages/trpc` não tiver Vitest configurado, colocar o teste em `packages/lib/server-only/waitlist/join-waitlist-request.test.ts` importando de `@documenso/trpc/server/waitlist-router/join-waitlist.types`): aceita payload válido e devolve e-mail em minúsculas; recusa `consent: false`; recusa `locale: 'es'`; recusa número com 5 dígitos.

- [ ] **Step 5: Rodar testes, ver passar. Commit** — `feat(waitlist): modelo WaitlistEntry, migração e esquema de inscrição (DOC-31)`.

---

### Task 3: Regra da inscrição (`joinWaitlist`)

**Files:**
- Create: `packages/lib/server-only/waitlist/join-waitlist.ts`
- Create: `packages/lib/server-only/waitlist/join-waitlist.test.ts`
- Modify: `packages/lib/server-only/rate-limit/rate-limits.ts` (acrescentar `waitlistJoinRateLimit`)

**Interfaces:**
- Consumes: `ZJoinWaitlistRequestSchema` (Task 2), `normalizeWaitlistPhone` (Task 2), `isWaitlistEnabled` (Task 1), `isDisposableEmail` (`packages/lib/constants/auth.ts`), `verifyCaptchaToken` (`packages/lib/server-only/captcha/verify-captcha.ts`), `createRateLimit`.
- Produces: `joinWaitlist({ input, ipAddress }): Promise<{ ok: true }>`; erros `AppError` com códigos `NOT_FOUND` (desligada), `TOO_MANY_REQUESTS` (limite), `INVALID_CAPTCHA`, e `WAITLIST_DISPOSABLE_EMAIL` (novo código em `AppErrorCode`? Não: usar `AppErrorCode.INVALID_BODY` com `message: 'WAITLIST_DISPOSABLE_EMAIL'` para a landing distinguir, como `SIGNUP_DISPOSABLE_EMAIL` faz no cadastro — conferir o código real usado em `packages/auth/server/routes/email-password.ts` e repetir o mesmo padrão).
- Job disparado: `send.waitlist.joined.emails` com `{ waitlistEntryId: string }` (definido na Task 4; aqui só a string do nome e o payload).

- [ ] **Step 1: Teste** com `vi.mock('@documenso/prisma')` (objeto com `waitlistEntry.findUnique`/`create` como `vi.fn()`), `vi.mock('@documenso/lib/jobs/client')` (`jobsClient.triggerJob = vi.fn()`), `vi.mock('../rate-limit/rate-limits')` (`waitlistJoinRateLimit.check` devolvendo `{ isLimited: false }` por padrão) e `vi.mock('../captcha/verify-captcha')`. Casos:
  - desligada → rejeita com `AppErrorCode.NOT_FOUND`, sem tocar no Prisma;
  - limite estourado → `TOO_MANY_REQUESTS`, sem Prisma;
  - isca preenchida → `{ ok: true }`, sem Prisma e sem job;
  - e-mail descartável (`alguem@mailinator.com`) → erro, sem Prisma;
  - repetido (findUnique devolve linha) → `{ ok: true }`, `create` não chamado, job não chamado; inclui o caso "  Ana@Exemplo.com " que deve procurar por `ana@exemplo.com`;
  - novo → `create` chamado com `phone: '+5562999999999'`, `locale`, `consentVersion`, `consentedAt` instância de `Date`, sem campo `ip`; job chamado com `{ waitlistEntryId: <id devolvido> }`; ordem: `create` antes de `triggerJob` (usar `mock.invocationCallOrder`).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

```ts
// rate-limits.ts (acrescentar)
// ---- Docverse waitlist (public form) ----
export const waitlistJoinRateLimit = createRateLimit({
  action: 'waitlist.join',
  max: 5,
  globalMax: 100,
  window: '1h',
});
```

```ts
// join-waitlist.ts
import { prisma } from '@documenso/prisma';

import { isDisposableEmail } from '../../constants/auth';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { jobsClient } from '../../jobs/client';
import { isWaitlistEnabled } from '../../utils/landing-waitlist';
import { verifyCaptchaToken } from '../captcha/verify-captcha';
import { waitlistJoinRateLimit } from '../rate-limit/rate-limits';
import { normalizeWaitlistPhone } from './normalize-phone';
import type { TJoinWaitlistRequest } from '@documenso/trpc/server/waitlist-router/join-waitlist.types';

export const WAITLIST_DISPOSABLE_EMAIL_MESSAGE = 'WAITLIST_DISPOSABLE_EMAIL';

export type JoinWaitlistOptions = {
  input: TJoinWaitlistRequest;
  ipAddress: string | null | undefined;
};

/**
 * Public sign-up to the waitlist. Every successful path answers the same `{ ok: true }`,
 * so the response never tells whether an address is already on the list.
 */
export const joinWaitlist = async ({ input, ipAddress }: JoinWaitlistOptions) => {
  if (!isWaitlistEnabled()) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'The waitlist is not enabled', statusCode: 404 });
  }

  const rateLimit = await waitlistJoinRateLimit.check({ ip: ipAddress ?? 'unknown' });

  if (rateLimit.isLimited) {
    throw new AppError(AppErrorCode.TOO_MANY_REQUESTS, { message: 'Too many sign-ups from this address', statusCode: 429 });
  }

  // Honeypot: answer as if it worked, store nothing.
  if (input.website) {
    return { ok: true } as const;
  }

  await verifyCaptchaToken({ token: input.captchaToken, ipAddress });

  const email = input.email.trim().toLowerCase();

  if (isDisposableEmail(email)) {
    throw new AppError(AppErrorCode.INVALID_BODY, { message: WAITLIST_DISPOSABLE_EMAIL_MESSAGE, statusCode: 400 });
  }

  const existing = await prisma.waitlistEntry.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    return { ok: true } as const;
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      name: input.name,
      email,
      phone: normalizeWaitlistPhone({ country: input.phoneCountry, area: input.phoneArea, number: input.phoneNumber }),
      locale: input.locale,
      consentVersion: input.consentVersion,
      consentedAt: new Date(),
    },
  });

  await jobsClient.triggerJob({
    name: 'send.waitlist.joined.emails',
    payload: { waitlistEntryId: entry.id },
  });

  return { ok: true } as const;
};
```

Conferir os nomes reais em `AppErrorCode` (`TOO_MANY_REQUESTS`, `INVALID_BODY`, `INVALID_CAPTCHA`, `NOT_FOUND`) em `packages/lib/errors/app-error.ts` e ajustar. Se o import de tipos de `@documenso/trpc` a partir de `packages/lib` criar ciclo, mover `join-waitlist.types.ts` para `packages/lib/server-only/waitlist/join-waitlist.types.ts` e reexportar do router.

- [ ] **Step 4: Rodar e ver passar. Commit** — `feat(waitlist): regra da inscrição com limite, isca, captcha e e-mail repetido (DOC-31)`.

---

### Task 4: E-mails da inscrição (confirmação e aviso) por job

**Files:**
- Create: `packages/email/template-components/template-waitlist-joined.tsx`
- Create: `packages/email/templates/waitlist-joined.tsx`
- Create: `packages/email/templates/waitlist-notice.tsx`
- Create: `packages/lib/jobs/definitions/emails/send-waitlist-joined-emails.ts`
- Create: `packages/lib/jobs/definitions/emails/send-waitlist-joined-emails.handler.ts`
- Modify: `packages/lib/jobs/client.ts` (registrar a definição, como `SEND_ADMIN_USER_CREATED_EMAIL_JOB_DEFINITION`)

**Interfaces:**
- Consumes: `WaitlistEntry` (Task 2), `renderEmailWithI18N`, `mailer`, `DOCUMENSO_INTERNAL_EMAIL`, `NEXT_PUBLIC_WEBAPP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL` via `SUPPORT_EMAIL` de `constants/app`.
- Produces: job `send.waitlist.joined.emails` com schema `z.object({ waitlistEntryId: z.string() })`.

- [ ] **Step 1: Templates.** `WaitlistJoinedTemplate({ name, email, phone, assetBaseUrl })`, no padrão de `admin-user-created.tsx`: logo, título `<Trans>You are on the Docverse waitlist</Trans>`, parágrafo `<Trans>Hi {name}, we saved your name, email ({email}) and phone ({phone}) to let you know when access opens.</Trans>`, parágrafo `<Trans>We will send you an email when your access is ready. Nothing else will be sent.</Trans>`, e, quando `SUPPORT_EMAIL` existir, `<Trans>To be removed from the list, write to <Link href={mailto}>{SUPPORT_EMAIL}</Link>.</Trans>`; `TemplateFooter isDocument={false}`. `WaitlistNoticeTemplate({ name, email, phone, locale, createdAt, adminUrl, assetBaseUrl })`: título `<Trans>New waitlist entry</Trans>`, lista com os dados e botão `<Trans>Open the waitlist</Trans>` para `adminUrl`.

- [ ] **Step 2: Definição e handler.** Definição igual à de `send-admin-user-created-email.ts`, com id `send.waitlist.joined.emails`, nome `Send Waitlist Joined Emails`. Handler:

```ts
export const run = async ({ payload, io }: { payload: TSendWaitlistJoinedEmailsJobDefinition; io: JobRunIO }) => {
  const entry = await prisma.waitlistEntry.findFirstOrThrow({ where: { id: payload.waitlistEntryId } });

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';

  await io.runTask('send-confirmation', async () => {
    const template = createElement(WaitlistJoinedTemplate, { name: entry.name, email: entry.email, phone: entry.phone, assetBaseUrl });
    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: entry.locale }),
      renderEmailWithI18N(template, { lang: entry.locale, plainText: true }),
    ]);
    const i18n = await getI18nInstance(entry.locale);

    await mailer.sendMail({
      to: { address: entry.email, name: entry.name },
      from: DOCUMENSO_INTERNAL_EMAIL,
      subject: i18n._(msg`You are on the Docverse waitlist`),
      html,
      text,
    });
  });

  const notifyEmail = env('NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL');

  if (!notifyEmail) {
    return;
  }

  await io.runTask('send-notice', async () => {
    const template = createElement(WaitlistNoticeTemplate, { ...dados, adminUrl: `${assetBaseUrl}/admin/waitlist`, assetBaseUrl });
    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: 'pt-BR' }),
      renderEmailWithI18N(template, { lang: 'pt-BR', plainText: true }),
    ]);
    const i18n = await getI18nInstance('pt-BR');

    await mailer.sendMail({
      to: { address: notifyEmail, name: '' },
      from: DOCUMENSO_INTERNAL_EMAIL,
      subject: i18n._(msg`New waitlist entry: ${entry.name}`),
      html,
      text,
    });
  });
};
```

Conferir a assinatura de `getI18nInstance(lang)` e de `io.runTask` nos handlers existentes.

- [ ] **Step 3: `npm run translate:extract` e traduzir as frases novas em `packages/lib/translations/pt-BR/web.po`** (o catálogo é regenerado com `--clean`; conferir no `git diff` que só entradas novas foram acrescentadas; se o extract mexer em mais coisa, fazer commit separado só do catálogo). `npm run translate:compile`.

- [ ] **Step 4: Tipos passam (`npx tsc --noEmit -p packages/lib` ou o comando de tipos do repo). Commit** — `feat(waitlist): e-mails de confirmação e aviso da inscrição (DOC-31)`.

---

### Task 5: Rota pública tRPC e formulário na landing

**Files:**
- Create: `packages/trpc/server/waitlist-router/join-waitlist.ts`
- Create: `packages/trpc/server/waitlist-router/router.ts`
- Modify: `packages/trpc/server/router.ts` (`waitlist: waitlistRouter`)
- Create: `apps/remix/app/components/docverse/landing-waitlist-form.tsx`
- Create: `apps/remix/app/components/docverse/landing-waitlist-section.tsx`
- Modify: `apps/remix/app/components/docverse/landing-page.tsx` (props, botões, seção, `LANDING_COPY`)
- Modify: `apps/remix/app/components/docverse/landing-pricing-section.tsx` (destino do botão)
- Modify: `apps/remix/app/routes/_index.tsx` (loader devolve `isWaitlistEnabled`)

**Interfaces:**
- Consumes: `joinWaitlist` (Task 3), `ZJoinWaitlistRequestSchema`/`ZJoinWaitlistResponseSchema` (Task 2), `getLandingSignupAction`, `isWaitlistEnabled`, `WAITLIST_CONSENT_VERSION` (Task 1).
- Produces: `trpc.waitlist.join.useMutation()`; `LandingPageProps.isWaitlistEnabled?: boolean`; `LandingPricingSectionProps.signupAction: LandingSignupAction`.

- [ ] **Step 1: Rota**

```ts
// join-waitlist.ts
import { joinWaitlist } from '@documenso/lib/server-only/waitlist/join-waitlist';

import { procedure } from '../trpc';
import { ZJoinWaitlistRequestSchema, ZJoinWaitlistResponseSchema } from './join-waitlist.types';

export const joinWaitlistRoute = procedure
  .input(ZJoinWaitlistRequestSchema)
  .output(ZJoinWaitlistResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { ipAddress } = ctx.metadata.requestMetadata;

    return await joinWaitlist({ input, ipAddress });
  });
```

`router.ts`: `export const waitlistRouter = router({ join: joinWaitlistRoute });`. Conferir se `procedure` exige `meta` para a OpenAPI (ver `report-recipient.ts`) e repetir.

- [ ] **Step 2: Loader e props.** Em `_index.tsx`: `isWaitlistEnabled: isWaitlistEnabled()` no retorno; passar para `LandingPage`. Em `landing-page.tsx`: `const signupAction = getLandingSignupAction({ isSignupEnabled, isWaitlistEnabled })`; cabeçalho e topo:

```tsx
{signupAction === 'signup' && (
  <Button asChild size="lg"><Link to="/signup">{copy.signUp}</Link></Button>
)}
{signupAction === 'waitlist' && (
  <Button asChild size="lg"><a href="#waitlist">{copy.waitlist.cta}</a></Button>
)}
```

O botão "Entrar" fica `variant={signupAction === 'none' ? 'default' : 'outline'}`. A seção `<LandingWaitlistSection lang={lang} />` aparece quando `isWaitlistEnabled`, entre recursos e planos. `LandingPricingSection` recebe `signupAction` e o botão do plano vai para `/signup`, `#waitlist` ou `/signin`.

- [ ] **Step 3: Copy** em `LANDING_COPY`, chave `waitlist`:

pt-BR: `cta: 'Entrar na lista de espera'`, `title: 'Lista de espera'`, `description: 'O cadastro nesta instância está fechado no momento. Deixe seus dados e avisamos por e-mail quando o acesso for liberado.'`, `name: 'Nome'`, `email: 'E-mail'`, `phone: 'Telefone'`, `phoneCountry: 'DDI'`, `phoneArea: 'DDD'`, `phoneNumber: 'Número'`, `consent: 'Concordo que o Docverse guarde meu nome, e-mail e telefone para me avisar quando o acesso for liberado. Posso pedir a remoção a qualquer momento.'`, `privacyPolicy: 'Política de privacidade'`, `removal: 'Para pedir a remoção, escreva para'`, `submit: 'Quero entrar na lista'`, `sending: 'Enviando...'`, `success: 'Você está na lista. Vamos avisar por e-mail quando o acesso for liberado.'`, `errorGeneric: 'Não foi possível registrar. Tente de novo em alguns minutos.'`, `errorRateLimited: 'Muitas tentativas deste endereço. Tente de novo mais tarde.'`, `errorDisposableEmail: 'Use um e-mail permanente; endereços descartáveis não são aceitos.'`, `errorConsent: 'Marque a caixa de consentimento para continuar.'`, `defaultCountry: '55'`.

en: `cta: 'Join the waitlist'`, `title: 'Waitlist'`, `description: 'Sign-up on this instance is currently closed. Leave your details and we will email you when access opens.'`, `name: 'Name'`, `email: 'Email'`, `phone: 'Phone'`, `phoneCountry: 'Country code'`, `phoneArea: 'Area code'`, `phoneNumber: 'Number'`, `consent: 'I agree that Docverse stores my name, email and phone number to let me know when access opens. I can ask for removal at any time.'`, `privacyPolicy: 'Privacy policy'`, `removal: 'To ask for removal, write to'`, `submit: 'Join the list'`, `sending: 'Sending...'`, `success: 'You are on the list. We will email you when access opens.'`, `errorGeneric: 'We could not save your details. Try again in a few minutes.'`, `errorRateLimited: 'Too many attempts from this address. Try again later.'`, `errorDisposableEmail: 'Use a permanent email; disposable addresses are not accepted.'`, `errorConsent: 'Tick the consent box to continue.'`, `defaultCountry: '1'`.

- [ ] **Step 4: Formulário** (`landing-waitlist-form.tsx`): `react-hook-form` + `zodResolver(ZJoinWaitlistRequestSchema.omit({ captchaToken: true, locale: true, consentVersion: true }))` ou estado simples com `useState`, como no resto da landing (preferir `useState` para manter a landing sem dependência do `Form` do app; a validação forte fica no servidor, o cliente só exige campos preenchidos e a caixa marcada). Campos com `Input` e `Checkbox` de `@documenso/ui/primitives`; honeypot `website` num `div` posicionado fora da tela com `aria-hidden` e `tabIndex={-1}`; `Turnstile` quando `env('NEXT_PUBLIC_TURNSTILE_SITE_KEY')`; `trpc.waitlist.join.useMutation()`; ao enviar, `locale: lang`, `consentVersion: WAITLIST_CONSENT_VERSION`. Erros: `AppError.parseError(err)`; `code === TOO_MANY_REQUESTS` → `errorRateLimited`; `message === 'WAITLIST_DISPOSABLE_EMAIL'` → `errorDisposableEmail`; senão `errorGeneric`. Sucesso substitui o formulário pelo texto `success` com ícone `CheckCircle2Icon`.

- [ ] **Step 5: Tipos e lint** (`npx tsc --noEmit` no app remix e `npx biome check apps/remix/app/components/docverse packages/trpc/server/waitlist-router`). **Commit** — `feat(landing): formulário de lista de espera e rota pública waitlist.join (DOC-31)`.

---

### Task 6: Regras do admin (`findWaitlistEntries`, `deleteWaitlistEntry`, `inviteWaitlistEntries`, CSV)

**Files:**
- Create: `packages/lib/server-only/waitlist/find-waitlist-entries.ts`
- Create: `packages/lib/server-only/waitlist/delete-waitlist-entry.ts`
- Create: `packages/lib/server-only/waitlist/invite-waitlist-entries.ts`
- Create: `packages/lib/server-only/waitlist/invite-waitlist-entries.test.ts`
- Create: `packages/lib/server-only/waitlist/waitlist-csv.ts`
- Create: `packages/lib/server-only/waitlist/waitlist-csv.test.ts`
- Create: `packages/email/template-components/template-waitlist-invite.tsx`, `packages/email/templates/waitlist-invite.tsx`
- Create: `packages/lib/jobs/definitions/emails/send-waitlist-invite-email.ts` + `.handler.ts`; registrar em `packages/lib/jobs/client.ts`

**Interfaces:**
- Produces:
  - `findWaitlistEntries({ query, page, perPage }) → { entries: Array<WaitlistEntry & { hasAccount: boolean }>, totalPages, count }`
  - `deleteWaitlistEntry({ id }) → void` (lança `NOT_FOUND` se não existir)
  - `inviteWaitlistEntries({ ids }) → { results: Array<{ id: string; status: 'INVITED' | 'EXISTING' | 'NOT_FOUND' | 'FAILED'; userId?: number; error?: string }> }`
  - `waitlistEntriesToCsv(entries) → string` (cabeçalho `name,email,phone,locale,consentVersion,consentedAt,createdAt,invitedAt`, valores com aspas escapadas, quebra `\n`)
  - job `send.waitlist.invite.email` com `{ waitlistEntryId: string; userId: number }`, token com validade `7 * ONE_DAY`.

- [ ] **Step 1: Testes** de `inviteWaitlistEntries` com Prisma e jobs como dublês:
  - inscrito não existe → `NOT_FOUND`, nada criado;
  - e-mail já tem usuário → `EXISTING`, `user.create` não chamado, `triggerJob` não chamado, `waitlistEntry.update` com `invitedAt` e `invitedUserId`;
  - novo → `user.create` com `{ name, email, password: null, emailVerified: Date }`, `onCreateUserHook` chamado (dublê de `../user/create-user`), `update` com `invitedAt`/`invitedUserId`, `triggerJob('send.waitlist.invite.email', { waitlistEntryId, userId })`;
  - erro num item não impede o seguinte → resultado `FAILED` com `error` e o próximo `INVITED`.
  Testes de `waitlistEntriesToCsv`: escapa vírgula e aspas no nome; `invitedAt` nulo vira vazio.

- [ ] **Step 2: Implementar.** `inviteWaitlistEntries` percorre os ids em sequência (para 100 itens é aceitável e evita corrida na criação de usuário). Criação do usuário inline (não usar `createAdminUser`, que não cria organização):

```ts
const user = await prisma.user.create({
  data: { name: entry.name, email: entry.email, password: null, emailVerified: new Date() },
});

await onCreateUserHook(user);
```

Handler do convite: igual ao de `send-admin-user-created-email.handler.ts`, com `expiry: new Date(Date.now() + 7 * ONE_DAY)`, template `WaitlistInviteTemplate({ name, setPasswordLink, assetBaseUrl })` no idioma `entry.locale`, assunto `msg\`Your Docverse access is ready\``; texto avisa que o link vale 7 dias e que depois disso basta usar "Forgot password" na tela de entrada.

- [ ] **Step 3: `npm run translate:extract`, traduzir pt-BR, `translate:compile`. Testes passam. Commit** — `feat(waitlist): busca, exclusão, CSV e convite dos inscritos (DOC-31)`.

---

### Task 7: Rotas `admin.waitlist.*` e página `/admin/waitlist`

**Files:**
- Create: `packages/trpc/server/admin-router/waitlist/find-waitlist-entries.ts` + `.types.ts`
- Create: `packages/trpc/server/admin-router/waitlist/delete-waitlist-entry.ts` + `.types.ts`
- Create: `packages/trpc/server/admin-router/waitlist/invite-waitlist-entries.ts` + `.types.ts`
- Create: `packages/trpc/server/admin-router/waitlist/export-waitlist-entries.ts` + `.types.ts`
- Modify: `packages/trpc/server/admin-router/router.ts` (`waitlist: { find, delete, invite, export }`)
- Create: `apps/remix/app/routes/_authenticated+/admin+/waitlist._index.tsx`
- Create: `apps/remix/app/components/tables/admin-waitlist-table.tsx`
- Modify: `apps/remix/app/routes/_authenticated+/admin+/_layout.tsx` (item de menu "Waitlist", ícone `ClipboardListIcon`, depois de Users)

**Interfaces:**
- Consumes: funções da Task 6.
- Produces: `trpc.admin.waitlist.find/delete/invite/export`.

- [ ] **Step 1: Rotas** com `adminProcedure`, tipos Zod em `.types.ts` (`ZFindWaitlistEntriesRequestSchema = z.object({ query: z.string().max(200).default(''), page: z.number().int().min(1).default(1), perPage: z.number().int().min(1).max(100).default(20) })`; `ZDeleteWaitlistEntryRequestSchema = z.object({ id: z.string().min(1) })`; `ZInviteWaitlistEntriesRequestSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })`; export sem entrada, devolve `{ csv: string, filename: string }`).

- [ ] **Step 2: Página.** Loader chama `findWaitlistEntries` direto (como `users._index.tsx`), com `search`, `page`, `perPage` da URL. Componente `AdminWaitlistTable` no padrão de `admin-dashboard-users-table.tsx`, com:
  - `Checkbox` por linha e no cabeçalho (seleção), `Button` "Invite selected" (`trpc.admin.waitlist.invite.useMutation`, confirmação com `AlertDialog`, `toast` com resumo `X invited, Y already had an account, Z failed`, depois `navigate('.', { replace: true })` ou `revalidate`);
  - colunas: Name, Email, Phone, Language, Signed up (data com `DateTime`/`formatDate` do repo), Invite (data ou `Not invited` / `Already had an account`);
  - por linha: botão "Invite" (ou "Resend") e "Delete" com `AlertDialog`;
  - botão "Export CSV" que chama `trpc.admin.waitlist.export` (via `useUtils().admin.waitlist.export.fetch()`) e baixa um `Blob` `text/csv` com o nome devolvido.

- [ ] **Step 3: Menu** no `_layout.tsx`:

```tsx
<Button
  variant="ghost"
  className={cn('justify-start md:w-full', pathname?.startsWith('/admin/waitlist') && 'bg-secondary')}
  asChild
>
  <Link to="/admin/waitlist">
    <ClipboardListIcon className="mr-2 h-5 w-5" />
    <Trans>Waitlist</Trans>
  </Link>
</Button>
```

- [ ] **Step 4: `translate:extract`, pt-BR, `translate:compile`. Tipos e lint. Commit** — `feat(admin): página da lista de espera com convite, exclusão e CSV (DOC-31)`.

---

### Task 8: Verificação final, docs e PR

**Files:**
- Modify: `apps/docs/content/docs/self-hosting/configuration/environment.mdx` (linhas das duas variáveis, se a tabela for do fork; se for do upstream, só o `.env.example`)
- Modify: `docs/superpowers/specs/2026-09-29-docverse-landing-waitlist-design.md` só se a implementação divergir do que está lá (registrar a divergência).

- [ ] **Step 1:** `npm run lint` (ou `npx biome check .` nos caminhos tocados), `npx tsc` nos pacotes tocados (ou o script `check-types` do repo), `npm test -w packages/lib` (todos os testes unitários), `npm run build` do app Remix (`npm run build -w apps/remix` ou `turbo run build --filter=@documenso/remix`). Anotar a saída literal para o relato.
- [ ] **Step 2 (opcional, se houver tempo):** subir Postgres descartável `tmp-docverse-waitlist-db` com `--rm`, rodar migrações, iniciar o app em dev com `NEXT_PUBLIC_WAITLIST_ENABLED=true NEXT_PUBLIC_DISABLE_SIGNUP=true`, enviar o formulário com `curl` na rota tRPC e conferir a linha no banco. Remover o container por nome ao fim.
- [ ] **Step 3:** `git push -u origin docverse/landing-waitlist` e `gh pr create --repo engenhariainversa/documenso --base main` (o `gh` sem `--repo` cai no upstream `documenso/documenso`). Corpo do PR: resumo, o que foi verificado, como ligar em produção, o que falta decidir. Terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 4:** Se algum erro não óbvio tiver sido resolvido no caminho, registrar a lição (`docs/lessons/` não existe na `main`; usar o `record_lesson` do termhub com `card: DOC-31` e o link do PR).

## Quebra sugerida em tickets do board

Não tenho ferramenta para criar cards; sugestão para quem criar:

1. DOC-31a — Flag, modelo `WaitlistEntry` e migração (Tasks 1–2).
2. DOC-31b — Rota pública `waitlist.join` com proteções e e-mails de inscrição (Tasks 3–4).
3. DOC-31c — Formulário na landing (Task 5).
4. DOC-31d — Admin `/admin/waitlist`: listar, CSV, excluir, convidar (Tasks 6–7).
5. DOC-31e — Verificação, PR e ligar em produção (Task 8 + decisões pendentes de `.env.prod`).
