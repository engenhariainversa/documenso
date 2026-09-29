import { APP_NAME, APP_SOURCE_URL } from '@documenso/lib/constants/brand';
import type { LandingLanguage } from '@documenso/lib/utils/landing-language';
import { formatLandingPlanPrice, LANDING_PLANS, type LandingPlanId } from '@documenso/lib/utils/landing-pricing';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { CheckIcon, ExternalLinkIcon } from 'lucide-react';
import { Link } from 'react-router';

export type LandingPricingSectionProps = {
  lang: LandingLanguage;
  isSignupEnabled: boolean;
};

/**
 * Plans section of the Docverse landing page.
 *
 * The copy lives in this file for the same reason as the rest of the landing page:
 * Portuguese is the main language here.
 */
export const LandingPricingSection = ({ lang, isSignupEnabled }: LandingPricingSectionProps) => {
  const copy = LANDING_PRICING_COPY[lang];

  return (
    <section id="planos" className="border-border border-t">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 md:px-8">
        <h2 className="font-semibold text-2xl tracking-tight">{copy.title}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">{copy.description}</p>

        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {LANDING_PLANS.map((plan) => {
            const planCopy = copy.plans[plan.id];

            const isCloud = plan.id === 'cloud';

            return (
              <li
                key={plan.id}
                className={cn('flex flex-col rounded-xl border bg-background p-6', {
                  'border-border': !isCloud,
                  'border-primary': isCloud,
                })}
              >
                <h3 className="font-medium text-lg">{planCopy.name}</h3>
                <p className="mt-1 text-muted-foreground text-sm">{planCopy.description}</p>

                <p className="mt-6">
                  <span className="font-bold text-3xl tracking-tight">
                    {formatLandingPlanPrice({ priceCents: plan.priceCents, lang })}
                  </span>

                  {plan.isMonthly && <span className="ml-1 text-muted-foreground text-sm">{copy.perMonth}</span>}
                </p>

                <ul className="mt-6 flex-1 space-y-2">
                  {planCopy.features.map((feature) => (
                    <li key={feature} className="flex gap-x-2 text-sm">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {isCloud ? (
                    <Button asChild className="w-full">
                      <Link to={isSignupEnabled ? '/signup' : '/signin'}>
                        {isSignupEnabled ? planCopy.action : copy.signIn}
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" className="w-full">
                      <a href={APP_SOURCE_URL} target="_blank" rel="noreferrer">
                        {planCopy.action}
                        <ExternalLinkIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                </div>

                {planCopy.note && <p className="mt-3 text-muted-foreground text-xs">{planCopy.note}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

type LandingPlanCopy = {
  name: string;
  description: string;
  features: string[];
  action: string;
  note?: string;
};

type LandingPricingCopy = {
  title: string;
  description: string;
  perMonth: string;
  signIn: string;
  plans: Record<LandingPlanId, LandingPlanCopy>;
};

export const LANDING_PRICING_COPY: Record<LandingLanguage, LandingPricingCopy> = {
  'pt-BR': {
    title: 'Planos',
    description: `O ${APP_NAME} é o mesmo nos dois planos. A diferença é quem cuida do servidor.`,
    perMonth: 'por mês',
    signIn: 'Entrar',
    plans: {
      'self-hosted': {
        name: 'Auto-hospedado',
        description: 'Você instala e mantém no seu próprio servidor.',
        features: [
          'Gratuito, para sempre',
          'Documentos, signatários, equipes e membros sem limite',
          'Todos os recursos, sem versão paga do código',
          'Seus dados ficam no seu servidor',
        ],
        action: 'Ver o código-fonte',
      },
      cloud: {
        name: `${APP_NAME} Cloud`,
        description: 'Nós cuidamos do servidor, das atualizações e dos backups.',
        features: [
          'Tudo ilimitado: documentos, signatários, equipes e membros',
          'Todos os recursos do plano auto-hospedado',
          'Sem instalação e sem manutenção',
          'Preço por organização, não por usuário',
        ],
        action: 'Criar conta',
        note: 'Crie a conta e explore sem pagar. O plano só é necessário para enviar documentos. Pagamento por Pix, um mês por vez.',
      },
    },
  },
  en: {
    title: 'Plans',
    description: `${APP_NAME} is the same on both plans. The difference is who runs the server.`,
    perMonth: 'per month',
    signIn: 'Sign in',
    plans: {
      'self-hosted': {
        name: 'Self-hosted',
        description: 'You install and run it on your own server.',
        features: [
          'Free, forever',
          'Unlimited documents, signers, teams and members',
          'Every feature, with no paid version of the code',
          'Your data stays on your server',
        ],
        action: 'View the source code',
      },
      cloud: {
        name: `${APP_NAME} Cloud`,
        description: 'We take care of the server, the updates and the backups.',
        features: [
          'Everything unlimited: documents, signers, teams and members',
          'Every feature of the self-hosted plan',
          'No installation and no maintenance',
          'Priced per organisation, not per user',
        ],
        action: 'Create account',
        note: 'Create the account and explore without paying. The plan is only needed to send documents. Payment by Pix, one month at a time.',
      },
    },
  },
};
