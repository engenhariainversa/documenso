export const LANDING_LANGUAGES = ['pt-BR', 'en'] as const;

export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

export const DEFAULT_LANDING_LANGUAGE: LandingLanguage = 'pt-BR';

type ResolveLandingLanguageOptions = {
  /**
   * Language explicitly requested by the visitor, e.g. the `lang` search param.
   */
  requestedLang?: string | null;

  /**
   * Raw value of the `accept-language` header.
   */
  acceptLanguage?: string | null;
};

const parseLandingLanguage = (value: string): LandingLanguage | null => {
  const [language] = value.trim().toLowerCase().split('-');

  if (language === 'pt') {
    return 'pt-BR';
  }

  if (language === 'en') {
    return 'en';
  }

  return null;
};

/**
 * Resolve the language of the Docverse landing page.
 *
 * The landing page is written in Brazilian Portuguese with an English version, so it
 * can't rely on the app wide language: Portuguese is the fallback here, not English.
 */
export const resolveLandingLanguage = ({
  requestedLang,
  acceptLanguage,
}: ResolveLandingLanguageOptions): LandingLanguage => {
  const requestedLanguage = requestedLang ? parseLandingLanguage(requestedLang) : null;

  if (requestedLanguage) {
    return requestedLanguage;
  }

  const preferredLanguages = (acceptLanguage ?? '')
    .split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.split(';');

      const qualityParam = params.find((param) => param.trim().startsWith('q='));
      const quality = qualityParam ? Number(qualityParam.trim().slice(2)) : 1;

      return {
        language: parseLandingLanguage(tag),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  // The first language of the visitor's preferences that the landing page is written in.
  const preferredLanguage = preferredLanguages.find((entry) => entry.language !== null);

  return preferredLanguage?.language ?? DEFAULT_LANDING_LANGUAGE;
};
