import { APP_NAME, APP_SOURCE_URL, APP_UPSTREAM_URL } from '@documenso/lib/constants/brand';
import type { LandingLanguage } from '@documenso/lib/utils/landing-language';
import { Button } from '@documenso/ui/primitives/button';
import type { LucideIcon } from 'lucide-react';
import {
  ClockIcon,
  CodeXmlIcon,
  ExternalLinkIcon,
  FileUpIcon,
  LanguagesIcon,
  MailCheckIcon,
  PaletteIcon,
  PenLineIcon,
  UsersIcon,
} from 'lucide-react';
import { Link } from 'react-router';

import { LandingPricingSection } from '~/components/docverse/landing-pricing-section';
import { BrandingLogo } from '~/components/general/branding-logo';

export type LandingPageProps = {
  lang: LandingLanguage;
  isSignupEnabled: boolean;

  /**
   * Whether to show the plans. Only true on an instance that sells the cloud plan.
   */
  isPricingVisible?: boolean;
};

/**
 * Public landing page of Docverse, shown on `/` to visitors who are not signed in.
 *
 * The copy lives in this file instead of the Lingui catalogs because Portuguese is the
 * main language here, while the rest of the app is written in English.
 *
 * Only list features that exist in the codebase today.
 */
export const LandingPage = ({ lang, isSignupEnabled, isPricingVisible = false }: LandingPageProps) => {
  const copy = LANDING_COPY[lang];

  const otherLang: LandingLanguage = lang === 'pt-BR' ? 'en' : 'pt-BR';

  return (
    <div lang={lang} className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-x-4 px-4 py-4 md:px-8">
          <Link to="/" aria-label={APP_NAME}>
            <BrandingLogo className="h-6 w-auto" />
          </Link>

          <nav className="flex items-center gap-x-1 sm:gap-x-2">
            <Link
              to={`/?lang=${otherLang}`}
              lang={otherLang}
              className="rounded-md px-2 py-2 text-muted-foreground text-sm hover:text-foreground"
            >
              {copy.switchLanguage}
            </Link>

            <Button asChild variant="ghost" size="sm">
              <Link to="/signin">{copy.signIn}</Link>
            </Button>

            {isSignupEnabled && (
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/signup">{copy.signUp}</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-16 text-center md:px-8 md:py-24">
          <p className="inline-flex rounded-full border border-border px-3 py-1 font-medium text-muted-foreground text-xs">
            {copy.badge}
          </p>

          <h1 className="mx-auto mt-6 max-w-3xl text-balance font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl">
            {copy.title}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
            {copy.description}
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {isSignupEnabled && (
              <Button asChild size="lg">
                <Link to="/signup">{copy.signUp}</Link>
              </Button>
            )}

            <Button asChild size="lg" variant={isSignupEnabled ? 'outline' : 'default'}>
              <Link to="/signin">{copy.signIn}</Link>
            </Button>
          </div>
        </section>

        <section className="border-border border-t bg-muted/30">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-8">
            <h2 className="font-semibold text-2xl tracking-tight">{copy.stepsTitle}</h2>

            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {copy.steps.map((step, index) => (
                <li key={step.title} className="flex gap-x-4 md:flex-col md:gap-y-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>

                  <div>
                    <h3 className="font-medium">
                      {index + 1}. {step.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-border border-t">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-8">
            <h2 className="font-semibold text-2xl tracking-tight">{copy.featuresTitle}</h2>
            <p className="mt-2 text-muted-foreground text-sm">{copy.featuresDescription}</p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {copy.features.map((feature) => (
                <li key={feature.title} className="rounded-xl border border-border bg-background p-5">
                  <feature.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="mt-3 font-medium">{feature.title}</h3>
                  <p className="mt-1 text-muted-foreground text-sm">{feature.description}</p>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl border border-border border-dashed p-5">
              <p className="inline-flex items-center gap-x-1.5 rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
                <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.comingSoon.label}
              </p>
              <h3 className="mt-3 font-medium">{copy.comingSoon.title}</h3>
              <p className="mt-1 text-muted-foreground text-sm">{copy.comingSoon.description}</p>
            </div>
          </div>
        </section>

        {isPricingVisible && <LandingPricingSection lang={lang} isSignupEnabled={isSignupEnabled} />}

        <section className="border-border border-t bg-muted/30">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-8">
            <h2 className="font-semibold text-2xl tracking-tight">{copy.openSource.title}</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">{copy.openSource.description}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline">
                <a href={APP_SOURCE_URL} target="_blank" rel="noreferrer">
                  {copy.openSource.sourceCode}
                  <ExternalLinkIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </Button>

              <Button asChild variant="ghost">
                <a href={LICENSE_URL} target="_blank" rel="noreferrer">
                  {copy.openSource.license}
                  <ExternalLinkIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            </div>

            <p className="mt-8 max-w-3xl text-muted-foreground text-sm">
              {copy.attribution.before}
              <a href={APP_UPSTREAM_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                Documenso
              </a>
              {copy.attribution.after}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>{copy.footer}</p>

          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <a href={APP_SOURCE_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
                {copy.openSource.sourceCode}
              </a>
            </li>
            <li>
              <a href={LICENSE_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
                {copy.openSource.license}
              </a>
            </li>
            <li>
              <Link to={`/?lang=${otherLang}`} lang={otherLang} className="hover:text-foreground">
                {copy.switchLanguage}
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
};

const LICENSE_URL = `${APP_SOURCE_URL}/blob/main/LICENSE`;

type LandingItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type LandingCopy = {
  metaTitle: string;
  metaDescription: string;
  switchLanguage: string;
  signIn: string;
  signUp: string;
  badge: string;
  title: string;
  description: string;
  stepsTitle: string;
  steps: LandingItem[];
  featuresTitle: string;
  featuresDescription: string;
  features: LandingItem[];
  comingSoon: {
    label: string;
    title: string;
    description: string;
  };
  openSource: {
    title: string;
    description: string;
    sourceCode: string;
    license: string;
  };
  attribution: {
    before: string;
    after: string;
  };
  footer: string;
};

export const LANDING_COPY: Record<LandingLanguage, LandingCopy> = {
  'pt-BR': {
    metaTitle: `${APP_NAME} - Assinatura eletrônica de documentos em código aberto`,
    metaDescription: `O ${APP_NAME} é uma plataforma de assinatura eletrônica de documentos, 100% open source (AGPLv3) e auto-hospedável.`,
    switchLanguage: 'English',
    signIn: 'Entrar',
    signUp: 'Criar conta',
    badge: '100% open source · AGPLv3',
    title: 'Assinatura eletrônica de documentos, em código aberto',
    description: `O ${APP_NAME} é uma plataforma de assinatura eletrônica de documentos. Todo o código é aberto sob a licença AGPLv3: você pode usar esta instância ou hospedar a sua.`,
    stepsTitle: 'Como funciona',
    steps: [
      {
        icon: FileUpIcon,
        title: 'Envie o documento',
        description: 'Faça o upload do PDF que precisa ser assinado.',
      },
      {
        icon: UsersIcon,
        title: 'Defina quem assina',
        description: 'Adicione os signatários e posicione os campos de assinatura no documento.',
      },
      {
        icon: PenLineIcon,
        title: 'Colete as assinaturas',
        description: 'Cada signatário recebe um link por e-mail e assina pelo navegador.',
      },
    ],
    featuresTitle: 'Recursos disponíveis hoje',
    featuresDescription: 'Tudo o que está listado aqui já existe no código e pode ser usado agora.',
    features: [
      {
        icon: CodeXmlIcon,
        title: 'Editor incorporável (embed)',
        description:
          'Incorpore a criação e a edição de documentos e modelos, além da própria assinatura, dentro do seu sistema.',
      },
      {
        icon: PaletteIcon,
        title: 'Marca branca',
        description: 'Use o seu logotipo e os dados da sua empresa nas páginas de assinatura e nos e-mails enviados.',
      },
      {
        icon: MailCheckIcon,
        title: 'Código por e-mail na assinatura',
        description:
          'O remetente pode exigir que o signatário confirme um código de 6 dígitos, enviado por e-mail, durante a assinatura.',
      },
      {
        icon: LanguagesIcon,
        title: 'Vários idiomas',
        description:
          'Interface em 11 idiomas. A tradução para o português do Brasil ainda é parcial: algumas telas aparecem em inglês.',
      },
    ],
    comingSoon: {
      label: 'Em breve',
      title: 'Assinatura com certificado ICP-Brasil',
      description:
        'Estamos trabalhando na assinatura com certificado digital ICP-Brasil em nuvem (BirdID). Esse recurso ainda não está disponível.',
    },
    openSource: {
      title: 'Código aberto e auto-hospedável',
      description: `O ${APP_NAME} é software livre sob a licença GNU AGPLv3. Você pode ler o código, modificá-lo e hospedar a sua própria instância, no seu servidor.`,
      sourceCode: 'Código-fonte',
      license: 'Licença AGPLv3',
    },
    attribution: {
      before: `O ${APP_NAME} é um trabalho derivado do `,
      after:
        ', © Documenso, Inc., licenciado sob a GNU AGPLv3. É um projeto independente, sem vínculo com a Documenso, Inc.',
    },
    footer: `${APP_NAME} · Software livre sob a licença AGPLv3`,
  },
  en: {
    metaTitle: `${APP_NAME} - Open source electronic document signing`,
    metaDescription: `${APP_NAME} is an electronic document signing platform, 100% open source (AGPLv3) and self-hostable.`,
    switchLanguage: 'Português',
    signIn: 'Sign in',
    signUp: 'Create account',
    badge: '100% open source · AGPLv3',
    title: 'Electronic document signing, open source',
    description: `${APP_NAME} is an electronic document signing platform. All of the code is open under the AGPLv3 license: you can use this instance or host your own.`,
    stepsTitle: 'How it works',
    steps: [
      {
        icon: FileUpIcon,
        title: 'Upload the document',
        description: 'Upload the PDF that needs to be signed.',
      },
      {
        icon: UsersIcon,
        title: 'Choose who signs',
        description: 'Add the signers and place the signature fields on the document.',
      },
      {
        icon: PenLineIcon,
        title: 'Collect the signatures',
        description: 'Each signer receives a link by email and signs in the browser.',
      },
    ],
    featuresTitle: 'Features available today',
    featuresDescription: 'Everything listed here already exists in the code and can be used now.',
    features: [
      {
        icon: CodeXmlIcon,
        title: 'Embeddable editor',
        description:
          'Embed the creation and editing of documents and templates, as well as the signing itself, in your own system.',
      },
      {
        icon: PaletteIcon,
        title: 'White label',
        description: 'Use your own logo and company details on the signing pages and on the emails sent.',
      },
      {
        icon: MailCheckIcon,
        title: 'Email code when signing',
        description: 'The sender can require the signer to confirm a 6 digit code, sent by email, while signing.',
      },
      {
        icon: LanguagesIcon,
        title: 'Multiple languages',
        description:
          'Interface in 11 languages. The Brazilian Portuguese translation is still partial: some screens show up in English.',
      },
    ],
    comingSoon: {
      label: 'Coming soon',
      title: 'Signing with an ICP-Brasil certificate',
      description:
        'We are working on signing with a cloud ICP-Brasil digital certificate (BirdID). This feature is not available yet.',
    },
    openSource: {
      title: 'Open source and self-hostable',
      description: `${APP_NAME} is free software under the GNU AGPLv3 license. You can read the code, modify it and host your own instance, on your own server.`,
      sourceCode: 'Source code',
      license: 'AGPLv3 license',
    },
    attribution: {
      before: `${APP_NAME} is a derivative work of `,
      after:
        ', © Documenso, Inc., licensed under the GNU AGPLv3. It is an independent project, not affiliated with Documenso, Inc.',
    },
    footer: `${APP_NAME} · Free software under the AGPLv3 license`,
  },
};
