import { router } from '../trpc';
import { createOrganisationEmailRoute } from './create-organisation-email';
import { createOrganisationEmailDomainRoute } from './create-organisation-email-domain';
import { cscSignEnvelopeRoute } from './csc-sign-envelope';
import { declineLinkOrganisationAccountRoute } from './decline-link-organisation-account';
import { deleteOrganisationEmailRoute } from './delete-organisation-email';
import { deleteOrganisationEmailDomainRoute } from './delete-organisation-email-domain';
import { findOrganisationEmailDomainsRoute } from './find-organisation-email-domain';
import { findOrganisationEmailsRoute } from './find-organisation-emails';
import { getOrganisationAuthenticationPortalRoute } from './get-organisation-authentication-portal';
import { getOrganisationEmailDomainRoute } from './get-organisation-email-domain';
import { linkOrganisationAccountRoute } from './link-organisation-account';
import { updateOrganisationAuthenticationPortalRoute } from './update-organisation-authentication-portal';
import { updateOrganisationEmailRoute } from './update-organisation-email';
import { verifyOrganisationEmailDomainRoute } from './verify-organisation-email-domain';

export const enterpriseRouter = router({
  organisation: {
    email: {
      find: findOrganisationEmailsRoute,
      create: createOrganisationEmailRoute,
      update: updateOrganisationEmailRoute,
      delete: deleteOrganisationEmailRoute,
    },
    emailDomain: {
      get: getOrganisationEmailDomainRoute,
      find: findOrganisationEmailDomainsRoute,
      create: createOrganisationEmailDomainRoute,
      delete: deleteOrganisationEmailDomainRoute,
      verify: verifyOrganisationEmailDomainRoute,
    },
    authenticationPortal: {
      get: getOrganisationAuthenticationPortalRoute,
      update: updateOrganisationAuthenticationPortalRoute,
      linkAccount: linkOrganisationAccountRoute,
      declineLinkAccount: declineLinkOrganisationAccountRoute,
    },
  },
  csc: {
    signEnvelope: cscSignEnvelopeRoute,
  },
});
