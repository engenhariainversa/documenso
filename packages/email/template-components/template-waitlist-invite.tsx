import { Trans } from '@lingui/react/macro';

import { Button, Section, Text } from '../components';
import { TemplateDocumentImage } from './template-document-image';

export type TemplateWaitlistInviteProps = {
  name: string;
  setPasswordLink: string;
  assetBaseUrl: string;
};

/**
 * Invite sent from the admin waitlist page: the account exists, the person sets the password.
 */
export const TemplateWaitlistInvite = ({ name, setPasswordLink, assetBaseUrl }: TemplateWaitlistInviteProps) => {
  return (
    <>
      <TemplateDocumentImage className="mt-6" assetBaseUrl={assetBaseUrl} />

      <Section className="flex-row items-center justify-center">
        <Text className="mx-auto mb-0 max-w-[80%] text-center font-semibold text-foreground text-lg">
          <Trans>Your Docverse access is ready</Trans>
        </Text>

        <Text className="my-1 text-center text-base text-muted-foreground">
          <Trans>
            Hi {name}, thank you for waiting. Your account has been created; set your password to get started.
          </Trans>
        </Text>

        <Section className="mt-8 mb-6 text-center">
          <Button
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-center font-medium text-primary-foreground text-sm no-underline"
            href={setPasswordLink}
          >
            <Trans>Set password</Trans>
          </Button>

          <Text className="mt-8 text-center text-muted-foreground text-sm italic">
            <Trans>
              You can also copy and paste this link into your browser: {setPasswordLink} (the link expires in 7 days;
              after that, use "Forgot password" on the sign in page)
            </Trans>
          </Text>
        </Section>
      </Section>
    </>
  );
};

export default TemplateWaitlistInvite;
