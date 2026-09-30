import { findWaitlistEntries } from '@documenso/lib/server-only/waitlist/find-waitlist-entries';
import { isWaitlistEnabled } from '@documenso/lib/utils/landing-waitlist';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { Trans } from '@lingui/react/macro';

import { AdminWaitlistTable } from '~/components/tables/admin-waitlist-table';

import type { Route } from './+types/waitlist._index';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);

  const page = Number(url.searchParams.get('page')) || 1;
  const perPage = Number(url.searchParams.get('perPage')) || 20;
  const query = url.searchParams.get('search') || '';

  const { entries, totalPages, count } = await findWaitlistEntries({ query, page, perPage });

  return {
    entries,
    totalPages,
    count,
    page,
    perPage,
    isWaitlistEnabled: isWaitlistEnabled(),
  };
}

export default function AdminWaitlistPage({ loaderData }: Route.ComponentProps) {
  const { entries, totalPages, count, page, perPage, isWaitlistEnabled } = loaderData;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-semibold text-4xl">
          <Trans>Waitlist</Trans>
        </h2>

        <p className="text-muted-foreground text-sm">
          <Trans>{count} people on the list</Trans>
        </p>
      </div>

      {!isWaitlistEnabled && (
        <Alert variant="neutral">
          <AlertDescription>
            <Trans>
              The waitlist form is not shown on the landing page. Set NEXT_PUBLIC_WAITLIST_ENABLED=true to accept new
              entries. The entries below can still be managed.
            </Trans>
          </AlertDescription>
        </Alert>
      )}

      <AdminWaitlistTable entries={entries} totalPages={totalPages} page={page} perPage={perPage} />
    </div>
  );
}
