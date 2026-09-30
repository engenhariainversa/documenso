import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

import { Body, Container, Head, Html, Img, Preview, Section } from '../components';
import { TemplateFooter } from '../template-components/template-footer';
import type { TemplateWaitlistInviteProps } from '../template-components/template-waitlist-invite';
import { TemplateWaitlistInvite } from '../template-components/template-waitlist-invite';
import { getEmailAssetUrl } from '../utils/asset-url';

export const WaitlistInviteTemplate = ({
  name,
  setPasswordLink,
  assetBaseUrl = 'http://localhost:3002',
}: TemplateWaitlistInviteProps) => {
  const { _ } = useLingui();

  const previewText = msg`Your Docverse access is ready`;

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

              <TemplateWaitlistInvite name={name} setPasswordLink={setPasswordLink} assetBaseUrl={assetBaseUrl} />
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

export default WaitlistInviteTemplate;
