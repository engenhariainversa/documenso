import { IS_CLOUD_BILLING_ENABLED } from '@documenso/lib/constants/cloud-billing';
import { AppError } from '@documenso/lib/errors/app-error';
import {
  applyCouponDiscount,
  isCouponDiscountValid,
  type TCouponDiscountType,
} from '@documenso/lib/universal/cloud-billing/coupon';
import { formatCentsAsCurrency } from '@documenso/lib/universal/cloud-billing/money';
import { trpc } from '@documenso/trpc/react';
import type { TAdminCloudBillingCoupon } from '@documenso/trpc/server/admin-router/cloud-billing-coupon/cloud-billing-coupon.types';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@documenso/ui/primitives/dialog';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Switch } from '@documenso/ui/primitives/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { LoaderIcon } from 'lucide-react';
import { useState } from 'react';

import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Coupons`);
}

const CURRENCY = 'BRL';

/**
 * "98,90" or "98.90" -> 9890. Null when it is not an amount.
 */
const parseReaisToCents = (value: string) => {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  return Math.round(Number(normalized) * 100);
};

/**
 * `datetime-local` values are in the admin's own time zone.
 */
const parseLocalDateTime = (value: string) => (value ? new Date(value) : null);

const toLocalDateTimeInput = (date: Date | null) => {
  if (!date) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const parseOptionalPositiveInt = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : Number.NaN;
};

export default function AdminCouponsPage() {
  const { _ } = useLingui();

  const isBillingEnabled = IS_CLOUD_BILLING_ENABLED();

  const { data, isLoading, refetch } = trpc.admin.cloudBillingCoupon.find.useQuery();

  const [editing, setEditing] = useState<TAdminCloudBillingCoupon | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-semibold text-4xl">
          <Trans>Coupons</Trans>
        </h2>

        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>
            Discount codes for the Docverse Cloud plan. The discounted amount is what the Pix charge asks for. A coupon
            cannot be deleted or have its discount changed: deactivate it and create another one.
          </Trans>
        </p>
      </div>

      {!isBillingEnabled && (
        <Alert variant="neutral" className="mb-6">
          <AlertDescription>
            <Trans>
              Cloud billing is disabled on this instance (NEXT_PUBLIC_CLOUD_BILLING_ENABLED). Coupons can be prepared,
              but nobody can use them yet.
            </Trans>
          </AlertDescription>
        </Alert>
      )}

      {data && <CreateCouponForm priceCents={data.priceCents} onCreated={() => void refetch()} />}

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-16">
          <LoaderIcon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <CouponsTable coupons={data.coupons} onEdit={setEditing} onChanged={() => void refetch()} />
      )}

      <EditCouponDialog
        coupon={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refetch();
        }}
      />

      <p className="mt-4 text-muted-foreground text-xs">{_(msg`Times are shown in your time zone.`)}</p>
    </div>
  );
}

type CreateCouponFormProps = {
  priceCents: number;
  onCreated: () => void;
};

const CreateCouponForm = ({ priceCents, onCreated }: CreateCouponFormProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<TCouponDiscountType>('AMOUNT_OFF');
  const [discountInput, setDiscountInput] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('1');

  const { mutateAsync: createCoupon, isPending } = trpc.admin.cloudBillingCoupon.create.useMutation();

  const discountValue =
    discountType === 'PERCENT' ? parseOptionalPositiveInt(discountInput) : parseReaisToCents(discountInput);

  const discount = discountValue !== null && !Number.isNaN(discountValue) ? { discountType, discountValue } : null;

  const isDiscountValid = discount !== null && isCouponDiscountValid(discount, priceCents);

  const maxRedemptionsValue = parseOptionalPositiveInt(maxRedemptions);

  const finalPrice = isDiscountValid
    ? formatCentsAsCurrency({ cents: applyCouponDiscount(discount, priceCents).amountCents, currency: CURRENCY })
    : null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!discount || !isDiscountValid || Number.isNaN(maxRedemptionsValue)) {
      return;
    }

    try {
      await createCoupon({
        code,
        description,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        validFrom: parseLocalDateTime(validFrom),
        validUntil: parseLocalDateTime(validUntil),
        maxRedemptions: maxRedemptionsValue,
      });

      toast({ title: _(msg`Coupon created`) });

      setCode('');
      setDescription('');
      setDiscountInput('');
      setValidFrom('');
      setValidUntil('');
      setMaxRedemptions('1');

      onCreated();
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Unable to create the coupon`),
        description: error.code === 'ALREADY_EXISTS' ? _(msg`A coupon with this code already exists.`) : error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <form className="mb-8 rounded-lg border border-border p-4" onSubmit={(event) => void onSubmit(event)}>
      <h3 className="mb-4 font-semibold">
        <Trans>New coupon</Trans>
      </h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="coupon-code">
            <Trans>Code</Trans>
          </Label>
          <Input
            id="coupon-code"
            required
            value={code}
            maxLength={32}
            pattern="[A-Za-z0-9_\-]{3,32}"
            className="uppercase"
            onChange={(event) => setCode(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>
            <Trans>Discount type</Trans>
          </Label>
          <Select value={discountType} onValueChange={(value) => setDiscountType(value as TCouponDiscountType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AMOUNT_OFF">{_(msg`Amount off (R$)`)}</SelectItem>
              <SelectItem value="PERCENT">{_(msg`Percentage off (%)`)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="coupon-discount">
            {discountType === 'PERCENT' ? <Trans>Percentage (1-99)</Trans> : <Trans>Amount off, e.g. 98,90</Trans>}
          </Label>
          <Input
            id="coupon-discount"
            required
            inputMode="decimal"
            value={discountInput}
            onChange={(event) => setDiscountInput(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {finalPrice ? (
              <Trans>Final price: {finalPrice}</Trans>
            ) : discountInput ? (
              <Trans>The discount must leave at least R$ 0,01 to pay.</Trans>
            ) : null}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="coupon-max-redemptions">
            <Trans>Usage limit (empty for no limit)</Trans>
          </Label>
          <Input
            id="coupon-max-redemptions"
            inputMode="numeric"
            value={maxRedemptions}
            onChange={(event) => setMaxRedemptions(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coupon-valid-from">
            <Trans>Valid from (optional)</Trans>
          </Label>
          <Input
            id="coupon-valid-from"
            type="datetime-local"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coupon-valid-until">
            <Trans>Valid until (optional)</Trans>
          </Label>
          <Input
            id="coupon-valid-until"
            type="datetime-local"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="coupon-description">
            <Trans>Internal note (optional)</Trans>
          </Label>
          <Input
            id="coupon-description"
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <Button
        type="submit"
        className="mt-4"
        loading={isPending}
        disabled={!isDiscountValid || Number.isNaN(maxRedemptionsValue)}
      >
        <Trans>Create coupon</Trans>
      </Button>
    </form>
  );
};

type CouponsTableProps = {
  coupons: TAdminCloudBillingCoupon[];
  onEdit: (coupon: TAdminCloudBillingCoupon) => void;
  onChanged: () => void;
};

const CouponsTable = ({ coupons, onEdit, onChanged }: CouponsTableProps) => {
  const { _, i18n } = useLingui();
  const { toast } = useToast();

  const { mutateAsync: updateCoupon } = trpc.admin.cloudBillingCoupon.update.useMutation();

  const onToggleActive = async (coupon: TAdminCloudBillingCoupon, isActive: boolean) => {
    try {
      await updateCoupon({ id: coupon.id, isActive });

      onChanged();
    } catch (err) {
      toast({
        title: _(msg`Unable to update the coupon`),
        description: AppError.parseError(err).message,
        variant: 'destructive',
      });
    }
  };

  const formatDate = (date: Date | null) => (date ? i18n.date(date, { dateStyle: 'short', timeStyle: 'short' }) : '-');

  if (coupons.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        <Trans>No coupons yet.</Trans>
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Trans>Code</Trans>
          </TableHead>
          <TableHead>
            <Trans>Discount</Trans>
          </TableHead>
          <TableHead>
            <Trans>Final price</Trans>
          </TableHead>
          <TableHead>
            <Trans>Validity</Trans>
          </TableHead>
          <TableHead>
            <Trans>Uses</Trans>
          </TableHead>
          <TableHead>
            <Trans>Active</Trans>
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>

      <TableBody>
        {coupons.map((coupon) => (
          <TableRow key={coupon.id}>
            <TableCell>
              <div className="font-medium font-mono">{coupon.code}</div>
              {coupon.description && <div className="text-muted-foreground text-xs">{coupon.description}</div>}
            </TableCell>
            <TableCell>
              {coupon.discountType === 'PERCENT'
                ? `${coupon.discountValue}%`
                : formatCentsAsCurrency({ cents: coupon.discountValue, currency: CURRENCY })}
            </TableCell>
            <TableCell>{formatCentsAsCurrency({ cents: coupon.finalAmountCents, currency: CURRENCY })}</TableCell>
            <TableCell className="text-xs">
              {formatDate(coupon.validFrom)} → {formatDate(coupon.validUntil)}
            </TableCell>
            <TableCell>
              <div>
                {coupon.paidRedemptions + coupon.pendingRedemptions} / {coupon.maxRedemptions ?? '∞'}
              </div>
              <div className="text-muted-foreground text-xs">
                <Trans>
                  {coupon.paidRedemptions} paid, {coupon.pendingRedemptions} pending
                </Trans>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Switch checked={coupon.isActive} onCheckedChange={(checked) => void onToggleActive(coupon, checked)} />
                {!coupon.isActive && (
                  <Badge variant="neutral">
                    <Trans>Inactive</Trans>
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Button variant="outline" size="sm" onClick={() => onEdit(coupon)}>
                <Trans>Edit</Trans>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

type EditCouponDialogProps = {
  coupon: TAdminCloudBillingCoupon | null;
  onClose: () => void;
  onSaved: () => void;
};

const EditCouponDialog = ({ coupon, onClose, onSaved }: EditCouponDialogProps) => {
  return (
    <Dialog open={coupon !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {coupon && <EditCouponForm key={coupon.id} coupon={coupon} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
};

type EditCouponFormProps = {
  coupon: TAdminCloudBillingCoupon;
  onClose: () => void;
  onSaved: () => void;
};

const EditCouponForm = ({ coupon, onClose, onSaved }: EditCouponFormProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const [description, setDescription] = useState(coupon.description);
  const [validFrom, setValidFrom] = useState(toLocalDateTimeInput(coupon.validFrom));
  const [validUntil, setValidUntil] = useState(toLocalDateTimeInput(coupon.validUntil));
  const [maxRedemptions, setMaxRedemptions] = useState(coupon.maxRedemptions?.toString() ?? '');

  const { mutateAsync: updateCoupon, isPending } = trpc.admin.cloudBillingCoupon.update.useMutation();

  const maxRedemptionsValue = parseOptionalPositiveInt(maxRedemptions);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (Number.isNaN(maxRedemptionsValue)) {
      return;
    }

    try {
      await updateCoupon({
        id: coupon.id,
        description,
        validFrom: parseLocalDateTime(validFrom),
        validUntil: parseLocalDateTime(validUntil),
        maxRedemptions: maxRedemptionsValue,
      });

      toast({ title: _(msg`Coupon updated`) });

      onSaved();
    } catch (err) {
      toast({
        title: _(msg`Unable to update the coupon`),
        description: AppError.parseError(err).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <DialogHeader>
        <DialogTitle>
          <Trans>Edit coupon {coupon.code}</Trans>
        </DialogTitle>
        <DialogDescription>
          <Trans>The code and the discount cannot change.</Trans>
        </DialogDescription>
      </DialogHeader>

      <div className="my-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-coupon-max-redemptions">
            <Trans>Usage limit (empty for no limit)</Trans>
          </Label>
          <Input
            id="edit-coupon-max-redemptions"
            inputMode="numeric"
            value={maxRedemptions}
            onChange={(event) => setMaxRedemptions(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-coupon-valid-from">
            <Trans>Valid from (optional)</Trans>
          </Label>
          <Input
            id="edit-coupon-valid-from"
            type="datetime-local"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-coupon-valid-until">
            <Trans>Valid until (optional)</Trans>
          </Label>
          <Input
            id="edit-coupon-valid-until"
            type="datetime-local"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-coupon-description">
            <Trans>Internal note (optional)</Trans>
          </Label>
          <Input
            id="edit-coupon-description"
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" loading={isPending} disabled={Number.isNaN(maxRedemptionsValue)}>
          <Trans>Save</Trans>
        </Button>
      </DialogFooter>
    </form>
  );
};
