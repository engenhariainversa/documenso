import { SUPPORT_EMAIL } from '@documenso/lib/constants/app';
import { Trans } from '@lingui/react/macro';

import { Link, Section, Text } from '../components';
import { TemplateDocumentImage } from './template-document-image';

export type TemplateWaitlistJoinedProps = {
  name: string;
  email: string;
  phone: string;
  assetBaseUrl: string;
};

/**
 * Confirmation sent once to a person who joined the landing page waitlist.
 * It repeats the data that was stored, so the person knows exactly what we keep.
 */
export const TemplateWaitlistJoined = ({ name, email, phone, assetBaseUrl }: TemplateWaitlistJoinedProps) => {
  return (
    <>
      <TemplateDocumentImage className="mt-6" assetBaseUrl={assetBaseUrl} />

      <Section className="flex-row items-center justify-center">
        <Text className="mx-auto mb-0 max-w-[80%] text-center font-semibold text-foreground text-lg">
          <Trans>You are on the Docverse waitlist</Trans>
        </Text>

        <Text className="my-1 text-center text-base text-muted-foreground">
          <Trans>
            Hi {name}, we saved your name, email ({email}) and phone ({phone}) to let you know when access opens.
          </Trans>
        </Text>

        <Text className="my-1 text-center text-base text-muted-foreground">
          <Trans>We will send you an email when your access is ready. Nothing else will be sent.</Trans>
        </Text>

        {SUPPORT_EMAIL && (
          <Section className="mt-8">
            <Text className="text-center text-muted-foreground text-sm">
              <Trans>
                To be removed from the list, write to{' '}
                <Link href={`mailto:${SUPPORT_EMAIL}`} className="text-primary">
                  {SUPPORT_EMAIL}
                </Link>
                .
              </Trans>
            </Text>
          </Section>
        )}
      </Section>
    </>
  );
};

export default TemplateWaitlistJoined;
