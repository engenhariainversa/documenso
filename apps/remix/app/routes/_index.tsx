import { extractCookieFromHeaders } from '@documenso/auth/server/lib/utils/cookies';
import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import {
  IS_GOOGLE_SSO_ENABLED,
  IS_MICROSOFT_SSO_ENABLED,
  IS_OIDC_SSO_ENABLED,
  isSignupEnabledForProvider,
} from '@documenso/lib/constants/auth';
import { PREFERRED_TEAM_URL_COOKIE } from '@documenso/lib/constants/cookies';
import { getTeams } from '@documenso/lib/server-only/team/get-teams';
import { DEFAULT_LANDING_LANGUAGE, resolveLandingLanguage } from '@documenso/lib/utils/landing-language';
import { isLandingPricingVisible } from '@documenso/lib/utils/landing-pricing';
import { isWaitlistEnabled } from '@documenso/lib/utils/landing-waitlist';
import { formatDocumentsPath } from '@documenso/lib/utils/teams';
import { ZTeamUrlSchema } from '@documenso/trpc/server/team-router/schema';
import { redirect } from 'react-router';

import { LANDING_COPY, LandingPage } from '~/components/docverse/landing-page';

import type { Route } from './+types/_index';

export function meta({ data }: Route.MetaArgs) {
  const copy = LANDING_COPY[data?.lang ?? DEFAULT_LANDING_LANGUAGE];

  return [
    { title: copy.metaTitle },
    { name: 'description', content: copy.metaDescription },
    { name: 'robots', content: 'index, follow' },
    { property: 'og:title', content: copy.metaTitle },
    { property: 'og:description', content: copy.metaDescription },
    { property: 'og:type', content: 'website' },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getOptionalSession(request);

  if (session.isAuthenticated) {
    const teamUrlCookie = extractCookieFromHeaders(PREFERRED_TEAM_URL_COOKIE, request.headers);

    // const referrer = request.headers.get('referer');
    // let isReferrerFromTeamUrl = false;

    // if (referrer) {
    //   const referrerUrl = new URL(referrer);

    //   if (referrerUrl.pathname.startsWith('/t/')) {
    //     isReferrerFromTeamUrl = true;
    //   }
    // }

    const preferredTeamUrl =
      teamUrlCookie && ZTeamUrlSchema.safeParse(teamUrlCookie).success ? teamUrlCookie : undefined;

    // // Early return for no preferred team.
    // if (!preferredTeamUrl || isReferrerFromTeamUrl) {
    //   throw redirect('/inbox');
    // }

    const teams = await getTeams({ userId: session.user.id });

    let currentTeam = teams.find((team) => team.url === preferredTeamUrl);

    if (!currentTeam && teams.length === 1) {
      currentTeam = teams[0];
    }

    if (!currentTeam) {
      throw redirect('/inbox');
    }

    throw redirect(formatDocumentsPath(currentTeam.url));
  }

  // Docverse: visitors who are not signed in get the landing page instead of `/signin`.
  const isSignupEnabled =
    isSignupEnabledForProvider('email') ||
    (IS_GOOGLE_SSO_ENABLED && isSignupEnabledForProvider('google')) ||
    (IS_MICROSOFT_SSO_ENABLED && isSignupEnabledForProvider('microsoft')) ||
    (IS_OIDC_SSO_ENABLED && isSignupEnabledForProvider('oidc'));

  return {
    lang: resolveLandingLanguage({
      requestedLang: new URL(request.url).searchParams.get('lang'),
      acceptLanguage: request.headers.get('accept-language'),
    }),
    isSignupEnabled,
    isPricingVisible: isLandingPricingVisible(),
    isWaitlistEnabled: isWaitlistEnabled(),
  };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { lang, isSignupEnabled, isPricingVisible, isWaitlistEnabled } = loaderData;

  return (
    <LandingPage
      lang={lang}
      isSignupEnabled={isSignupEnabled}
      isPricingVisible={isPricingVisible}
      isWaitlistEnabled={isWaitlistEnabled}
    />
  );
}
