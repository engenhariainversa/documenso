import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatLandingPlanPrice,
  isLandingPricingVisible,
  LANDING_CLOUD_PLAN_PRICE_CENTS,
  LANDING_PLANS,
} from './landing-pricing';

describe('LANDING_PLANS', () => {
  it('lists the self-hosted plan first and the cloud plan second', () => {
    expect(LANDING_PLANS.map((plan) => plan.id)).toEqual(['self-hosted', 'cloud']);
  });

  it('keeps self-hosting free', () => {
    const selfHosted = LANDING_PLANS.find((plan) => plan.id === 'self-hosted');

    expect(selfHosted?.priceCents).toBe(0);
    expect(selfHosted?.isMonthly).toBe(false);
  });

  it('charges R$ 99,90 per month for the cloud', () => {
    const cloud = LANDING_PLANS.find((plan) => plan.id === 'cloud');

    expect(LANDING_CLOUD_PLAN_PRICE_CENTS).toBe(9990);
    expect(cloud?.priceCents).toBe(9990);
    expect(cloud?.isMonthly).toBe(true);
  });
});

describe('formatLandingPlanPrice', () => {
  it('shows a free plan as a word, in the language of the page', () => {
    expect(formatLandingPlanPrice({ priceCents: 0, lang: 'pt-BR' })).toBe('Grátis');
    expect(formatLandingPlanPrice({ priceCents: 0, lang: 'en' })).toBe('Free');
  });

  it.each(['pt-BR', 'en'] as const)('shows the price in reais, the Brazilian way, in %s', (lang) => {
    expect(formatLandingPlanPrice({ priceCents: 9990, lang })).toBe('R$ 99,90');
  });

  it('separates thousands with a dot', () => {
    expect(formatLandingPlanPrice({ priceCents: 123456, lang: 'pt-BR' })).toBe('R$ 1.234,56');
  });

  it('uses a plain space after the currency symbol', () => {
    expect(formatLandingPlanPrice({ priceCents: 9990, lang: 'pt-BR' })).not.toMatch(/ /);
  });
});

describe('isLandingPricingVisible', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, '', 'false', '1', 'TRUE'])('hides the plans when cloud billing is %j', (value) => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', value);

    expect(isLandingPricingVisible()).toBe(false);
  });

  it('shows the plans only when cloud billing is enabled', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

    expect(isLandingPricingVisible()).toBe(true);
  });
});
