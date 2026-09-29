import { useCopyToClipboard } from '@documenso/lib/client-only/hooks/use-copy-to-clipboard';
import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { IS_CLOUD_BILLING_ENABLED } from '@documenso/lib/constants/cloud-billing';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { formatCentsAsCurrency } from '@documenso/lib/universal/cloud-billing/money';
import type { TCloudSubscriptionState } from '@documenso/lib/universal/cloud-billing/subscription-state';
import { canExecuteOrganisationAction } from '@documenso/lib/utils/organisations';
import { trpc } from '@documenso/trpc/react';
import type { TGetSubscriptionResponse } from '@documenso/trpc/server/billing-router/get-subscription.types';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { useToast } from '@documenso/ui/primitives/use-toast';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { CheckIcon, CopyIcon, ExternalLinkIcon, Loader } from 'lucide-react';
import { match } from 'ts-pattern';

import { GenericErrorLayout } from '~/components/general/generic-error-layout';
import { SettingsHeader } from '~/components/general/settings-header';
import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Plan`);
}

export default function OrganisationSettingsBillingPage() {
  const organisation = useCurrentOrganisation();

  const { _, i18n } = useLingui();
  const { toast } = useToast();
  const { refreshSession } = useSession();

  const isBillingEnabled = IS_CLOUD_BILLING_ENABLED();

  const canManageBilling = canExecuteOrganisationAction('MANAGE_BILLING', organisation.currentOrganisationRole);

  const {
    data: subscription,
    isLoading: isLoadingSubscription,
    isRefetching: isRefetchingSubscription,
    refetch: refetchSubscription,
  } = trpc.billing.getSubscription.useQuery(
    {
      organisationId: organisation.id,
    },
    {
      enabled: isBillingEnabled && canManageBilling,
    },
  );

  const { mutateAsync: createCheckout, isPending: isCreatingCheckout } = trpc.billing.createCheckout.useMutation();

  const onSubscribeClick = async () => {
    try {
      await createCheckout({ organisationId: organisation.id });

      await refetchSubscription();
    } catch (err) {
      const error = AppError.parseError(err);

      const description = match(error.code)
        .with(AppErrorCode.NOT_SETUP, () => msg`Payments are not available yet. Please try again later.`)
        .with(AppErrorCode.ALREADY_EXISTS, () => msg`A payment is already being prepared. Please wait a moment.`)
        .otherwise(() => msg`We were unable to start the payment at this time. Please try again later.`);

      toast({
        title: _(msg`Something went wrong`),
        description: _(description),
        variant: 'destructive',
      });
    }
  };

  const onPaidClick = async () => {
    const { data } = await refetchSubscription();

    if (data?.state === 'ACTIVE') {
      // The session carries the subscription used by the rest of the app.
      await refreshSession();

      toast({
        title: _(msg`Plan active`),
        description: _(msg`Your payment was confirmed. You can send documents now.`),
      });

      return;
    }

    toast({
      title: _(msg`Payment not confirmed yet`),
      description: _(msg`It can take a few minutes. Check again shortly.`),
    });
  };

  if (!isBillingEnabled || !canManageBilling) {
    return (
      <GenericErrorLayout
        errorCode={404}
        errorCodeMap={{
          404: {
            heading: msg`Page not found`,
            subHeading: msg`404 Page not found`,
            message: msg`The page you are looking for may have been removed, renamed or may have never existed.`,
          },
        }}
      />
    );
  }

  if (isLoadingSubscription || !subscription) {
    return (
      <div className="flex items-center justify-center rounded-lg py-32">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { state, pendingCharge, currentPeriodEnd, isProviderConfigured } = subscription;

  const price = formatCentsAsCurrency({ cents: subscription.priceCents, currency: subscription.currency });

  const isRenewal = state !== 'NONE';

  return (
    <div>
      <SettingsHeader title={_(msg`Plan`)} subtitle={_(msg`Manage the Docverse Cloud plan of your organisation.`)} />

      <section className="max-w-2xl space-y-6">
        <div className="rounded-lg border border-border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">Docverse Cloud</h3>

              <p className="mt-1 text-muted-foreground text-sm">
                <Trans>Everything unlimited: documents, recipients, teams and members.</Trans>
              </p>
            </div>

            <SubscriptionStateBadge state={state} />
          </div>

          <p className="mt-6">
            <span className="font-bold text-3xl">{price}</span>{' '}
            <span className="text-muted-foreground text-sm">
              <Trans>per month</Trans>
            </span>
          </p>

          <p className="mt-4 text-muted-foreground text-sm">
            <SubscriptionStateDescription
              state={state}
              periodEnd={currentPeriodEnd ? i18n.date(currentPeriodEnd, { dateStyle: 'long' }) : ''}
            />
          </p>

          {!pendingCharge && (
            <Button
              className="mt-6"
              loading={isCreatingCheckout}
              disabled={!isProviderConfigured}
              onClick={() => void onSubscribeClick()}
            >
              {isRenewal ? <Trans>Renew for one month</Trans> : <Trans>Subscribe</Trans>}
            </Button>
          )}

          {!isProviderConfigured && (
            <p className="mt-3 text-muted-foreground text-xs">
              <Trans>Payments are not available yet.</Trans>
            </p>
          )}
        </div>

        {pendingCharge && (
          <PendingChargeCard
            charge={pendingCharge}
            isChecking={isRefetchingSubscription}
            onPaidClick={() => void onPaidClick()}
          />
        )}

        <p className="text-muted-foreground text-xs">
          <Trans>
            Payment is made by Pix, one month at a time. The plan does not renew on its own: you choose when to pay for
            the next month.
          </Trans>
        </p>
      </section>
    </div>
  );
}

type SubscriptionStateBadgeProps = {
  state: TCloudSubscriptionState;
};

const SubscriptionStateBadge = ({ state }: SubscriptionStateBadgeProps) => {
  const { _ } = useLingui();

  const { label, variant } = match(state)
    .with('ACTIVE', () => ({ label: msg`Active`, variant: 'default' as const }))
    .with('GRACE', () => ({ label: msg`Expired`, variant: 'warning' as const }))
    .with('EXPIRED', () => ({ label: msg`Expired`, variant: 'destructive' as const }))
    .otherwise(() => ({ label: msg`No plan`, variant: 'neutral' as const }));

  return <Badge variant={variant}>{_(label)}</Badge>;
};

type SubscriptionStateDescriptionProps = {
  state: TCloudSubscriptionState;
  periodEnd: string;
};

const SubscriptionStateDescription = ({ state, periodEnd }: SubscriptionStateDescriptionProps) => {
  const { _ } = useLingui();

  const description: MessageDescriptor = match(state)
    .with('ACTIVE', () => msg`Your plan is active until ${periodEnd}.`)
    .with('GRACE', () => msg`Your plan expired on ${periodEnd}. Renew it to keep sending documents.`)
    .with('EXPIRED', () => msg`Your plan expired on ${periodEnd}. You can create documents, but not send them.`)
    .otherwise(() => msg`You can create documents, but you need a plan to send them.`);

  return <>{_(description)}</>;
};

type PendingChargeCardProps = {
  charge: NonNullable<TGetSubscriptionResponse['pendingCharge']>;
  isChecking: boolean;
  onPaidClick: () => void;
};

const PendingChargeCard = ({ charge, isChecking, onPaidClick }: PendingChargeCardProps) => {
  const { _, i18n } = useLingui();
  const { toast } = useToast();

  const [copiedValue, copyToClipboard] = useCopyToClipboard();

  const amount = formatCentsAsCurrency({ cents: charge.amountCents, currency: charge.currency });

  const expiresAt = charge.expiresAt ? i18n.date(charge.expiresAt, { dateStyle: 'long', timeStyle: 'short' }) : null;

  const onCopyClick = async () => {
    if (!charge.pixCopyPaste) {
      return;
    }

    const isCopied = await copyToClipboard(charge.pixCopyPaste);

    if (!isCopied) {
      toast({
        title: _(msg`Unable to copy`),
        description: _(msg`Select the code and copy it manually.`),
        variant: 'destructive',
      });
    }
  };

  return (
    <Alert variant="neutral" className="border border-border">
      <AlertTitle>
        <Trans>Waiting for payment of {amount}</Trans>
      </AlertTitle>

      <AlertDescription className="space-y-4">
        <p>
          <Trans>Pay with Pix. The plan is activated when the payment is confirmed.</Trans>
        </p>

        {expiresAt && (
          <p>
            <Trans>This payment request expires on {expiresAt}.</Trans>
          </p>
        )}

        {charge.pixCopyPaste && (
          <div>
            <p className="font-medium text-foreground">
              <Trans>Pix copy and paste</Trans>
            </p>

            <code className="mt-2 block max-h-32 overflow-y-auto break-all rounded-md bg-muted p-3 text-xs">
              {charge.pixCopyPaste}
            </code>

            <Button variant="outline" size="sm" className="mt-2" onClick={() => void onCopyClick()}>
              {copiedValue === charge.pixCopyPaste ? (
                <CheckIcon className="mr-2 h-4 w-4" />
              ) : (
                <CopyIcon className="mr-2 h-4 w-4" />
              )}
              <Trans>Copy code</Trans>
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {charge.paymentUrl && (
            <Button asChild>
              <a href={charge.paymentUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                <Trans>Open payment page</Trans>
              </a>
            </Button>
          )}

          <Button variant="secondary" loading={isChecking} onClick={onPaidClick}>
            <Trans>I have paid</Trans>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};
