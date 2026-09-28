import { APP_SOURCE_URL } from '@documenso/lib/constants/brand';
import { cn } from '@documenso/ui/lib/utils';
import { Trans } from '@lingui/react/macro';

export type SourceCodeLinkProps = {
  className?: string;
};

/**
 * AGPLv3 §13 "source code" link.
 *
 * Every network user of this instance must have access to a link to the
 * corresponding source code, so this component is rendered unconditionally
 * (never gated behind `hidePoweredBy` or similar branding toggles).
 */
export const SourceCodeLink = ({ className }: SourceCodeLinkProps) => {
  return (
    <a
      href={APP_SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground', className)}
    >
      <Trans>Source code</Trans>
    </a>
  );
};
