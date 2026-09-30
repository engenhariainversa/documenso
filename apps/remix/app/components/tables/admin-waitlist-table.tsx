import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import { useUpdateSearchParams } from '@documenso/lib/client-only/hooks/use-update-search-params';
import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import type { TAdminWaitlistEntry } from '@documenso/trpc/server/admin-router/waitlist/find-waitlist-entries.types';
import type { TInviteWaitlistEntriesResponse } from '@documenso/trpc/server/admin-router/waitlist/invite-waitlist-entries.types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@documenso/ui/primitives/alert-dialog';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import type { DataTableColumnDef } from '@documenso/ui/primitives/data-table';
import { DataTable } from '@documenso/ui/primitives/data-table';
import { DataTablePagination } from '@documenso/ui/primitives/data-table-pagination';
import { Input } from '@documenso/ui/primitives/input';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { DownloadIcon, Loader, MailPlusIcon, Trash2Icon } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRevalidator } from 'react-router';

type AdminWaitlistTableProps = {
  entries: TAdminWaitlistEntry[];
  totalPages: number;
  perPage: number;
  page: number;
};

/**
 * Waitlist entries for the admin: search, select, invite, delete and export.
 */
export const AdminWaitlistTable = ({ entries, totalPages, perPage, page }: AdminWaitlistTableProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();

  const [isPending, startTransition] = useTransition();
  const updateSearchParams = useUpdateSearchParams();
  const [searchString, setSearchString] = useState('');
  const debouncedSearchString = useDebouncedValue(searchString, 1000);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const utils = trpc.useUtils();
  const { mutateAsync: inviteEntries, isPending: isInviting } = trpc.admin.waitlist.invite.useMutation();
  const { mutateAsync: deleteEntry, isPending: isDeleting } = trpc.admin.waitlist.delete.useMutation();

  const allOnPageSelected = entries.length > 0 && entries.every((entry) => selectedIds.has(entry.id));

  const toggleAll = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      for (const entry of entries) {
        if (checked) {
          next.add(entry.id);
        } else {
          next.delete(entry.id);
        }
      }

      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  };

  const summariseInvite = (results: TInviteWaitlistEntriesResponse['results']) => {
    const invited = results.filter((result) => result.status === 'INVITED').length;
    const existing = results.filter((result) => result.status === 'EXISTING').length;
    const failed = results.filter((result) => result.status === 'FAILED' || result.status === 'NOT_FOUND').length;

    return _(msg`${invited} invited, ${existing} already had an account, ${failed} failed`);
  };

  const onInvite = async (ids: string[]) => {
    try {
      const { results } = await inviteEntries({ ids });

      toast({
        title: _(msg`Invites processed`),
        description: summariseInvite(results),
        duration: 7500,
      });

      setSelectedIds(new Set());

      await revalidate();
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Could not send the invites`),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteEntry({ id });

      toast({
        title: _(msg`Entry removed`),
        description: _(msg`The person is no longer on the waitlist.`),
      });

      await revalidate();
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Could not remove the entry`),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const onExport = async () => {
    setIsExporting(true);

    try {
      const { csv, filename } = await utils.admin.waitlist.export.fetch();

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Could not export the waitlist`),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const columns = useMemo(() => {
    return [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allOnPageSelected}
            onCheckedChange={(checked) => toggleAll(checked === true)}
            aria-label={_(msg`Select all on this page`)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={(checked) => toggleOne(row.original.id, checked === true)}
            aria-label={_(msg`Select ${row.original.email}`)}
          />
        ),
      },
      {
        header: _(msg`Name`),
        accessorKey: 'name',
      },
      {
        header: _(msg`Email`),
        accessorKey: 'email',
      },
      {
        header: _(msg`Phone`),
        accessorKey: 'phone',
      },
      {
        header: _(msg`Language`),
        accessorKey: 'locale',
      },
      {
        header: _(msg`Signed up at`),
        accessorKey: 'createdAt',
        cell: ({ row }) => DateTime.fromJSDate(row.original.createdAt).toLocaleString(DateTime.DATETIME_SHORT),
      },
      {
        header: _(msg`Invite`),
        accessorKey: 'invitedAt',
        cell: ({ row }) => {
          if (row.original.invitedAt) {
            return DateTime.fromJSDate(row.original.invitedAt).toLocaleString(DateTime.DATETIME_SHORT);
          }

          if (row.original.hasAccount) {
            return <span className="text-muted-foreground">{_(msg`Already had an account`)}</span>;
          }

          return <span className="text-muted-foreground">{_(msg`Not invited`)}</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-x-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isInviting}>
                  <MailPlusIcon className="mr-2 h-4 w-4" />
                  {row.original.invitedAt ? <Trans>Resend</Trans> : <Trans>Invite</Trans>}
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <Trans>Invite {row.original.name}?</Trans>
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <Trans>
                      An account will be created for {row.original.email} and the person will receive an email with a
                      link to set the password. If the email already has an account, only the invite date is recorded.
                    </Trans>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <Trans>Cancel</Trans>
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onInvite([row.original.id])}>
                    <Trans>Invite</Trans>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  <Trash2Icon className="mr-2 h-4 w-4" />
                  <Trans>Delete</Trans>
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <Trans>Remove {row.original.email} from the waitlist?</Trans>
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <Trans>
                      The entry is deleted permanently. Use this to fulfil a removal request. Accounts already created
                      by an invite are not affected.
                    </Trans>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <Trans>Cancel</Trans>
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDelete(row.original.id)}>
                    <Trans>Delete</Trans>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ),
      },
    ] satisfies DataTableColumnDef<TAdminWaitlistEntry>[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, selectedIds, allOnPageSelected, isInviting, isDeleting]);

  useEffect(() => {
    startTransition(() => {
      updateSearchParams({
        search: debouncedSearchString,
        page: 1,
        perPage,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchString]);

  const onPaginationChange = (page: number, perPage: number) => {
    startTransition(() => {
      updateSearchParams({
        page,
        perPage,
      });
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="relative">
      <div className="my-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Input
          className="sm:max-w-sm"
          type="text"
          placeholder={_(msg`Search by name or email`)}
          value={searchString}
          onChange={(event) => setSearchString(event.target.value)}
        />

        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={selectedCount === 0 || isInviting} loading={isInviting}>
                <MailPlusIcon className="mr-2 h-4 w-4" />
                <Trans>Invite selected ({selectedCount})</Trans>
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans>Invite {selectedCount} people?</Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans>
                    An account will be created for each selected person, who will receive an email with a link to set
                    the password. People whose email already has an account only get the invite date recorded.
                  </Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Trans>Cancel</Trans>
                </AlertDialogCancel>
                <AlertDialogAction onClick={() => void onInvite(Array.from(selectedIds))}>
                  <Trans>Invite</Trans>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="outline" onClick={() => void onExport()} loading={isExporting}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            <Trans>Export CSV</Trans>
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={entries}
        perPage={perPage}
        currentPage={page}
        totalPages={totalPages}
        onPaginationChange={onPaginationChange}
      >
        {(table) => <DataTablePagination additionalInformation="VisibleCount" table={table} />}
      </DataTable>

      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <Loader className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      )}
    </div>
  );
};
