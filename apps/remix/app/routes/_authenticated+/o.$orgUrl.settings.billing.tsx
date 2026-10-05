import { useCopyToClipboard } from '@documenso/lib/client-only/hooks/use-copy-to-clipboard';
import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { IS_CLOUD_BILLING_ENABLED } from '@documenso/lib/constants/cloud-billing';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { formatCentsAsCurrency } from '@documenso/lib/universal/cloud-billing/money';
import { isPaymentConfirmed } from '@documenso/lib/universal/cloud-billing/payment-confirmation';
import type { TCloudSubscriptionState } from '@documenso/lib/universal/cloud-billing/subscription-state';
import { canExecuteOrganisationAction } from '@documenso/lib/utils/organisations';
import { trpc } from '@documenso/trpc/react';
import type { TGetSubscriptionResponse } from '@documenso/trpc/server/billing-router/get-subscription.types';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { useToast } from '@documenso/ui/primitives/use-toast';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { CheckIcon, CopyIcon, ExternalLinkIcon, LoaderIcon } from 'lucide-react';
import { useState } from 'react';
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

  const [couponCode, setCouponCode] = useState('');

  const onCheckoutClick = async ({
    isReplacement,
    withCoupon = true,
  }: {
    isReplacement: boolean;
    withCoupon?: boolean;
  }) => {
    try {
      await createCheckout({
        organisationId: organisation.id,
        isReplacement,
        couponCode: withCoupon && couponCode.trim() ? couponCode.trim() : undefined,
      });

      setCouponCode('');
    } catch (err) {
      const error = AppError.parseError(err);

      const description = match(error.code)
        .with(AppErrorCode.NOT_SETUP, () => msg`Payments are not available yet. Please try again later.`)
        .with(AppErrorCode.ALREADY_EXISTS, () => msg`A payment is already being prepared. Please wait a moment.`)
        .with('COUPON_NOT_FOUND', 'COUPON_INACTIVE', () => msg`This coupon does not exist.`)
        .with('COUPON_NOT_STARTED', () => msg`This coupon is not valid yet.`)
        .with('COUPON_EXPIRED', () => msg`This coupon has expired.`)
        .with('COUPON_EXHAUSTED', () => msg`This coupon has already been used up.`)
        .otherwise(() => msg`We were unable to start the payment at this time. Please try again later.`);

      toast({
        title: _(msg`Something went wrong`),
        description: _(description),
        variant: 'destructive',
      });
    }

    // Also after a failure: the payment being prepared may be ready by now.
    await refetchSubscription();
  };

  const onPaidClick = async () => {
    if (!subscription) {
      return;
    }

    const { data } = await refetchSubscription();

    // The state of the plan is not enough, an early renewal is already active.
    const isConfirmed = data !== undefined && isPaymentConfirmed({ before: subscription, after: data });

    if (isConfirmed) {
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
        <LoaderIcon className="h-6 w-6 animate-spin text-muted-foreground" />
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

          {(!pendingCharge || !pendingCharge.couponCode) && isProviderConfigured && (
            <div className="mt-6 max-w-xs space-y-2">
              <Label htmlFor="cloud-billing-coupon">
                <Trans>Coupon (optional)</Trans>
              </Label>

              <div className="flex gap-2">
                <Input
                  id="cloud-billing-coupon"
                  value={couponCode}
                  maxLength={32}
                  autoComplete="off"
                  className="uppercase"
                  onChange={(event) => setCouponCode(event.target.value)}
                />

                {pendingCharge && (
                  <Button
                    variant="secondary"
                    loading={isCreatingCheckout}
                    disabled={!couponCode.trim()}
                    onClick={() => void onCheckoutClick({ isReplacement: false })}
                  >
                    <Trans>Apply</Trans>
                  </Button>
                )}
              </div>
            </div>
          )}

          {!pendingCharge && (
            <Button
              className="mt-6"
              loading={isCreatingCheckout}
              disabled={!isProviderConfigured}
              onClick={() => void onCheckoutClick({ isReplacement: false })}
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
            isReplacing={isCreatingCheckout}
            onPaidClick={() => void onPaidClick()}
            onReplaceClick={() => void onCheckoutClick({ isReplacement: true, withCoupon: false })}
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
  isReplacing: boolean;
  onPaidClick: () => void;
  onReplaceClick: () => void;
};

const PendingChargeCard = ({
  charge,
  isChecking,
  isReplacing,
  onPaidClick,
  onReplaceClick,
}: PendingChargeCardProps) => {
  const { _, i18n } = useLingui();
  const { toast } = useToast();

  const [copiedValue, copyToClipboard] = useCopyToClipboard();

  const amount = formatCentsAsCurrency({ cents: charge.amountCents, currency: charge.currency });

  const discount = formatCentsAsCurrency({ cents: charge.discountCents, currency: charge.currency });

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

        {charge.couponCode && (
          <p>
            <Trans>
              Coupon {charge.couponCode} applied: {discount} off.
            </Trans>
          </p>
        )}

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

          <Button variant="secondary" loading={isChecking} disabled={isReplacing} onClick={onPaidClick}>
            <Trans>I have paid</Trans>
          </Button>

          <Button variant="ghost" loading={isReplacing} disabled={isChecking} onClick={onReplaceClick}>
            <Trans>Generate a new code</Trans>
          </Button>
        </div>

        <p className="text-xs">
          <Trans>If the code no longer works, generate a new one. Pay only one of them.</Trans>
        </p>
      </AlertDescription>
    </Alert>
  );
};
