import { mailer } from '@documenso/email/mailer';
import { WaitlistJoinedTemplate } from '@documenso/email/templates/waitlist-joined';
import { WaitlistNoticeTemplate } from '@documenso/email/templates/waitlist-notice';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import { createElement } from 'react';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { DOCUMENSO_INTERNAL_EMAIL } from '../../../constants/email';
import { env } from '../../../utils/env';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendWaitlistJoinedEmailsJobDefinition } from './send-waitlist-joined-emails';

/**
 * Emails of a new waitlist entry:
 *
 * 1. A confirmation to the person, in the language of the form.
 * 2. A notice to `NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL`, in pt-BR, when that address is set.
 */
export const run = async ({ payload, io }: { payload: TSendWaitlistJoinedEmailsJobDefinition; io: JobRunIO }) => {
  const entry = await prisma.waitlistEntry.findFirstOrThrow({
    where: { id: payload.waitlistEntryId },
  });

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';

  await io.runTask('send-waitlist-confirmation', async () => {
    const template = createElement(WaitlistJoinedTemplate, {
      name: entry.name,
      email: entry.email,
      phone: entry.phone,
      assetBaseUrl,
    });

    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: entry.locale }),
      renderEmailWithI18N(template, { lang: entry.locale, plainText: true }),
    ]);

    const i18n = await getI18nInstance(entry.locale);

    await mailer.sendMail({
      to: { address: entry.email, name: entry.name },
      from: DOCUMENSO_INTERNAL_EMAIL,
      subject: i18n._(msg`You are on the Docverse waitlist`),
      html,
      text,
    });
  });

  const notifyEmail = env('NEXT_PRIVATE_WAITLIST_NOTIFY_EMAIL');

  if (!notifyEmail) {
    return;
  }

  await io.runTask('send-waitlist-notice', async () => {
    const template = createElement(WaitlistNoticeTemplate, {
      name: entry.name,
      email: entry.email,
      phone: entry.phone,
      locale: entry.locale,
      createdAt: entry.createdAt.toISOString(),
      adminUrl: `${assetBaseUrl}/admin/waitlist`,
      assetBaseUrl,
    });

    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: 'pt-BR' }),
      renderEmailWithI18N(template, { lang: 'pt-BR', plainText: true }),
    ]);

    const i18n = await getI18nInstance('pt-BR');

    await mailer.sendMail({
      to: { address: notifyEmail, name: '' },
      from: DOCUMENSO_INTERNAL_EMAIL,
      subject: i18n._(msg`New waitlist entry: ${entry.name}`),
      html,
      text,
    });
  });
};
