import { NEXT_PUBLIC_PRIVACY_URL } from '@documenso/lib/constants/app';
import { env } from '@documenso/lib/utils/env';
import type { LandingLanguage } from '@documenso/lib/utils/landing-language';
import {
  getWaitlistFormErrorKind,
  WAITLIST_CONSENT_VERSION,
  type WaitlistFormErrorKind,
} from '@documenso/lib/utils/landing-waitlist';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { Turnstile } from '@marsidev/react-turnstile';
import { CheckCircle2Icon } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';

export type LandingWaitlistFormProps = {
  lang: LandingLanguage;
};

type FormState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done' }
  | { kind: 'error'; reason: WaitlistFormErrorKind };

const onlyDigits = (value: string) => value.replace(/\D+/g, '');

/**
 * Waitlist form of the landing page.
 *
 * The strong validation lives on the server (`ZJoinWaitlistRequestSchema`); here the
 * browser only requires the fields to be filled and the consent box to be ticked.
 */
export const LandingWaitlistForm = ({ lang }: LandingWaitlistFormProps) => {
  const copy = LANDING_WAITLIST_COPY[lang];
  const id = useId();

  const privacyUrl = NEXT_PUBLIC_PRIVACY_URL();
  const supportEmail = env('NEXT_PUBLIC_SUPPORT_EMAIL');

  const turnstileSiteKey = env('NEXT_PUBLIC_TURNSTILE_SITE_KEY');
  const turnstileRef = useRef<TurnstileInstance>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(copy.defaultCountry);
  const [phoneArea, setPhoneArea] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot: people never see it, bots fill it.
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  const { mutateAsync: join } = trpc.waitlist.join.useMutation();

  const isSending = state.kind === 'sending';

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!consent) {
      setState({ kind: 'error', reason: 'consent' });
      return;
    }

    setState({ kind: 'sending' });

    try {
      let captchaToken: string | undefined;

      if (turnstileSiteKey) {
        captchaToken = await turnstileRef.current?.getResponsePromise(3000).catch(() => undefined);
      }

      await join({
        name,
        email,
        phoneCountry,
        phoneArea,
        phoneNumber,
        locale: lang,
        consent: true,
        consentVersion: WAITLIST_CONSENT_VERSION,
        website,
        captchaToken,
      });

      setState({ kind: 'done' });
    } catch (err) {
      turnstileRef.current?.reset();

      setState({ kind: 'error', reason: getWaitlistFormErrorKind(err) });
    }
  };

  if (state.kind === 'done') {
    return (
      <div role="status" className="flex items-start gap-x-3 rounded-xl border border-border bg-background p-5">
        <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>{copy.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>{copy.name}</Label>
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-email`}>{copy.email}</Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            autoComplete="email"
          />
        </div>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="font-medium text-sm">{copy.phone}</legend>

        <div className="grid grid-cols-[5.5rem_5.5rem_1fr] gap-2">
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm"
              aria-hidden="true"
            >
              +
            </span>
            <Input
              className="pl-6"
              inputMode="numeric"
              aria-label={copy.phoneCountry}
              placeholder={copy.phoneCountry}
              value={phoneCountry}
              onChange={(event) => setPhoneCountry(onlyDigits(event.target.value).slice(0, 4))}
              required
              autoComplete="tel-country-code"
            />
          </div>

          <Input
            inputMode="numeric"
            aria-label={copy.phoneArea}
            placeholder={copy.phoneArea}
            value={phoneArea}
            onChange={(event) => setPhoneArea(onlyDigits(event.target.value).slice(0, 5))}
            required
            autoComplete="tel-area-code"
          />

          <Input
            inputMode="numeric"
            aria-label={copy.phoneNumber}
            placeholder={copy.phoneNumber}
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(onlyDigits(event.target.value).slice(0, 12))}
            required
            autoComplete="tel-local"
          />
        </div>
      </fieldset>

      <div className="flex items-start gap-x-3">
        <Checkbox
          id={`${id}-consent`}
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          className="mt-0.5"
        />

        <div className="space-y-1 text-sm">
          <Label htmlFor={`${id}-consent`} className="font-normal leading-snug">
            {copy.consent}
          </Label>

          {(privacyUrl || supportEmail) && (
            <p className="text-muted-foreground text-xs">
              {privacyUrl && (
                <a href={privacyUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                  {copy.privacyPolicy}
                </a>
              )}
              {privacyUrl && supportEmail && ' · '}
              {supportEmail && (
                <>
                  {copy.removal}{' '}
                  <a href={`mailto:${supportEmail}`} className="underline hover:text-foreground">
                    {supportEmail}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="absolute top-auto -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <input
          tabIndex={-1}
          autoComplete="off"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {turnstileSiteKey && (
        <Turnstile
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          options={{
            size: 'flexible',
            appearance: 'always',
            language: lang === 'pt-BR' ? 'pt-br' : 'en',
          }}
        />
      )}

      {state.kind === 'error' && (
        <p role="alert" className="text-destructive text-sm">
          {copy.errors[state.reason]}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        loading={isSending}
        disabled={isSending || !name || !email || !phoneCountry || !phoneArea || !phoneNumber}
      >
        {isSending ? copy.sending : copy.submit}
      </Button>
    </form>
  );
};

type LandingWaitlistCopy = {
  name: string;
  email: string;
  phone: string;
  phoneCountry: string;
  phoneArea: string;
  phoneNumber: string;
  defaultCountry: string;
  consent: string;
  privacyPolicy: string;
  removal: string;
  submit: string;
  sending: string;
  success: string;
  errors: Record<WaitlistFormErrorKind, string>;
};

/**
 * Text of the consent box. `WAITLIST_CONSENT_VERSION` must be bumped whenever it changes.
 */
export const LANDING_WAITLIST_COPY: Record<LandingLanguage, LandingWaitlistCopy> = {
  'pt-BR': {
    name: 'Nome',
    email: 'E-mail',
    phone: 'Telefone',
    phoneCountry: 'DDI',
    phoneArea: 'DDD',
    phoneNumber: 'Número',
    defaultCountry: '55',
    consent:
      'Concordo que o Docverse guarde meu nome, e-mail e telefone para me avisar quando o acesso for liberado. Posso pedir a remoção a qualquer momento.',
    privacyPolicy: 'Política de privacidade',
    removal: 'Para pedir a remoção, escreva para',
    submit: 'Quero entrar na lista',
    sending: 'Enviando...',
    success: 'Você está na lista. Vamos avisar por e-mail quando o acesso for liberado.',
    errors: {
      consent: 'Marque a caixa de consentimento para continuar.',
      rateLimited: 'Muitas tentativas deste endereço. Tente de novo mais tarde.',
      disposableEmail: 'Use um e-mail permanente; endereços descartáveis não são aceitos.',
      generic: 'Não foi possível registrar. Tente de novo em alguns minutos.',
    },
  },
  en: {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    phoneCountry: 'Country code',
    phoneArea: 'Area code',
    phoneNumber: 'Number',
    defaultCountry: '1',
    consent:
      'I agree that Docverse stores my name, email and phone number to let me know when access opens. I can ask for removal at any time.',
    privacyPolicy: 'Privacy policy',
    removal: 'To ask for removal, write to',
    submit: 'Join the list',
    sending: 'Sending...',
    success: 'You are on the list. We will email you when access opens.',
    errors: {
      consent: 'Tick the consent box to continue.',
      rateLimited: 'Too many attempts from this address. Try again later.',
      disposableEmail: 'Use a permanent email; disposable addresses are not accepted.',
      generic: 'We could not save your details. Try again in a few minutes.',
    },
  },
};
