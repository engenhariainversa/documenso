import { useOptionalCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { IS_CLOUD_BILLING_ENABLED } from '@documenso/lib/constants/cloud-billing';
import { getCloudSubscriptionLimits } from '@documenso/lib/universal/cloud-billing/subscription-state';
import { canExecuteOrganisationAction } from '@documenso/lib/utils/organisations';
import { Button } from '@documenso/ui/primitives/button';
import { Trans } from '@lingui/react/macro';
import { CreditCardIcon } from 'lucide-react';
import { Link } from 'react-router';

/**
 * Docverse Cloud: tells the members of an organisation without an active plan that
 * they can create documents but not send them. Never rendered on self-hosted instances.
 */
export const CloudSubscriptionBanner = () => {
  const organisation = useOptionalCurrentOrganisation();

  if (!organisation || !IS_CLOUD_BILLING_ENABLED()) {
    return null;
  }

  const { state, isSendingAllowed } = getCloudSubscriptionLimits({
    isBillingEnabled: true,
    currentPeriodEnd: organisation.cloudSubscription?.currentPeriodEnd,
  });

  const canManageBilling = canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole);

  if (isSendingAllowed && state !== 'GRACE') {
    return null;
  }

  // The grace period only concerns whoever can renew the plan.
  if (state === 'GRACE' && !canManageBilling) {
    return null;
  }

  return (
    <div className="bg-yellow-200 text-yellow-900 dark:bg-yellow-400">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2 font-medium text-sm">
        <div className="flex items-center">
          <CreditCardIcon className="mr-2.5 h-5 w-5 flex-shrink-0" />

          {state === 'GRACE' && <Trans>Your plan has expired. Renew it to keep sending documents.</Trans>}

          {state === 'EXPIRED' && <Trans>Your plan has expired. You can create documents, but not send them.</Trans>}

          {state === 'NONE' && <Trans>You can create documents, but you need a plan to send them.</Trans>}
        </div>

        {canManageBilling && (
          <Button variant="outline" size="sm" className="text-yellow-900 hover:bg-yellow-100" asChild>
            <Link to={`/o/${organisation.url}/settings/billing`}>
              <Trans>View plan</Trans>
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
};
