import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';

import { Body, Button, Container, Head, Html, Img, Preview, Section, Text } from '../components';
import { TemplateFooter } from '../template-components/template-footer';
import { getEmailAssetUrl } from '../utils/asset-url';

export type WaitlistNoticeTemplateProps = {
  name: string;
  email: string;
  phone: string;
  locale: string;
  createdAt: string;
  adminUrl: string;
  assetBaseUrl: string;
};

/**
 * Notice sent to the instance owner for each new waitlist entry.
 */
export const WaitlistNoticeTemplate = ({
  name,
  email,
  phone,
  locale,
  createdAt,
  adminUrl,
  assetBaseUrl = 'http://localhost:3002',
}: WaitlistNoticeTemplateProps) => {
  const { _ } = useLingui();

  const previewText = msg`New waitlist entry: ${name}`;

  return (
    <Html>
      <Head />
      <Body className="mx-auto my-auto bg-background font-sans">
        <Preview>{_(previewText)}</Preview>

        <Section>
          <Container className="mx-auto mt-8 mb-2 max-w-xl rounded-lg border border-border border-solid p-4 backdrop-blur-sm">
            <Section>
              <Img
                src={getEmailAssetUrl(assetBaseUrl, 'static/docverse-logo.png')}
                alt="Docverse Logo"
                className="mb-4 h-6"
              />

              <Text className="mb-0 font-semibold text-foreground text-lg">
                <Trans>New waitlist entry</Trans>
              </Text>

              <Text className="my-1 text-base text-muted-foreground">
                <Trans>Name</Trans>: {name}
              </Text>
              <Text className="my-1 text-base text-muted-foreground">
                <Trans>Email</Trans>: {email}
              </Text>
              <Text className="my-1 text-base text-muted-foreground">
                <Trans>Phone</Trans>: {phone}
              </Text>
              <Text className="my-1 text-base text-muted-foreground">
                <Trans>Language</Trans>: {locale}
              </Text>
              <Text className="my-1 text-base text-muted-foreground">
                <Trans>Signed up at</Trans>: {createdAt}
              </Text>

              <Section className="mt-6 mb-2 text-center">
                <Button
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-center font-medium text-primary-foreground text-sm no-underline"
                  href={adminUrl}
                >
                  <Trans>Open the waitlist</Trans>
                </Button>
              </Section>
            </Section>
          </Container>
          <div className="mx-auto mt-12 max-w-xl" />

          <Container className="mx-auto max-w-xl">
            <TemplateFooter isDocument={false} />
          </Container>
        </Section>
      </Body>
    </Html>
  );
};

export default WaitlistNoticeTemplate;
