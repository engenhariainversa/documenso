import type { LandingLanguage } from '@documenso/lib/utils/landing-language';

import { LandingWaitlistForm } from '~/components/docverse/landing-waitlist-form';

export type LandingWaitlistSectionProps = {
  lang: LandingLanguage;
  isSignupEnabled: boolean;
};

/**
 * Waitlist section of the Docverse landing page, shown when `NEXT_PUBLIC_WAITLIST_ENABLED` is on.
 * The copy lives here for the same reason as the rest of the landing page.
 */
export const LandingWaitlistSection = ({ lang, isSignupEnabled }: LandingWaitlistSectionProps) => {
  const copy = LANDING_WAITLIST_SECTION_COPY[lang];

  return (
    <section id="waitlist" className="scroll-mt-8 border-border border-t bg-muted/30">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-8">
        <h2 className="font-semibold text-2xl tracking-tight">{copy.title}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          {isSignupEnabled ? copy.descriptionSignupOpen : copy.descriptionSignupClosed}
        </p>

        <div className="mt-8 max-w-2xl">
          <LandingWaitlistForm lang={lang} />
        </div>
      </div>
    </section>
  );
};

type LandingWaitlistSectionCopy = {
  title: string;
  descriptionSignupClosed: string;
  descriptionSignupOpen: string;
};

export const LANDING_WAITLIST_SECTION_COPY: Record<LandingLanguage, LandingWaitlistSectionCopy> = {
  'pt-BR': {
    title: 'Lista de espera',
    descriptionSignupClosed:
      'O cadastro nesta instância está fechado no momento. Deixe seus dados e avisamos por e-mail quando o acesso for liberado.',
    descriptionSignupOpen: 'Deixe seus dados e avisamos por e-mail quando houver novidades sobre o acesso.',
  },
  en: {
    title: 'Waitlist',
    descriptionSignupClosed:
      'Sign-up on this instance is currently closed. Leave your details and we will email you when access opens.',
    descriptionSignupOpen: 'Leave your details and we will email you when there is news about access.',
  },
};
