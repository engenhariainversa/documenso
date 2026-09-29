import { env } from './env';
import type { LandingLanguage } from './landing-language';

/**
 * Plans shown on the Docverse landing page.
 *
 * Self-hosting is free and unlimited. Docverse Cloud is a single paid plan, with
 * everything unlimited.
 */
export const LANDING_CLOUD_PLAN_PRICE_CENTS = 9990;

export type LandingPlanId = 'self-hosted' | 'cloud';

export type LandingPlan = {
  id: LandingPlanId;
  priceCents: number;
  isMonthly: boolean;
};

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'self-hosted',
    priceCents: 0,
    isMonthly: false,
  },
  {
    id: 'cloud',
    priceCents: LANDING_CLOUD_PLAN_PRICE_CENTS,
    isMonthly: true,
  },
];

export type FormatLandingPlanPriceOptions = {
  priceCents: number;
  lang: LandingLanguage;
};

/**
 * The plan is priced and charged in reais, so the amount always uses the Brazilian
 * format, whatever the language of the page.
 */
export const formatLandingPlanPrice = ({ priceCents, lang }: FormatLandingPlanPriceOptions) => {
  if (priceCents === 0) {
    return lang === 'pt-BR' ? 'Grátis' : 'Free';
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(priceCents / 100)
    .replace(/ /g, ' ');
};

/**
 * The plans are only advertised on an instance that actually sells the cloud plan.
 *
 * A self-hosted instance, or the cloud before billing is turned on, shows no prices.
 */
export const isLandingPricingVisible = () => env('NEXT_PUBLIC_CLOUD_BILLING_ENABLED') === 'true';
