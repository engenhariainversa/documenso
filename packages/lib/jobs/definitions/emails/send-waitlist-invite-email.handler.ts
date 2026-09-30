import crypto from 'node:crypto';
import { mailer } from '@documenso/email/mailer';
import { WaitlistInviteTemplate } from '@documenso/email/templates/waitlist-invite';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import { createElement } from 'react';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { DOCUMENSO_INTERNAL_EMAIL } from '../../../constants/email';
import { ONE_WEEK } from '../../../constants/time';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendWaitlistInviteEmailJobDefinition } from './send-waitlist-invite-email';

/**
 * How long the set-password link of a waitlist invite stays valid. Longer than the
 * admin-created-user link because people read these emails days later; after it
 * expires, "Forgot password" on the sign in page issues a new one.
 */
export const WAITLIST_INVITE_TOKEN_TTL_MS = ONE_WEEK;

/**
 * Invite email of a waitlist entry: a set-password link, in the language of the entry.
 */
export const run = async ({ payload, io }: { payload: TSendWaitlistInviteEmailJobDefinition; io: JobRunIO }) => {
  const [entry, user] = await Promise.all([
    prisma.waitlistEntry.findFirstOrThrow({ where: { id: payload.waitlistEntryId } }),
    prisma.user.findFirstOrThrow({ where: { id: payload.userId } }),
  ]);

  const token = await io.runTask('create-password-reset-token', async () => {
    const passwordResetToken = await prisma.passwordResetToken.create({
      data: {
        token: crypto.randomBytes(18).toString('hex'),
        expiry: new Date(Date.now() + WAITLIST_INVITE_TOKEN_TTL_MS),
        userId: user.id,
      },
    });

    return passwordResetToken.token;
  });

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';
  const setPasswordLink = `${assetBaseUrl}/reset-password/${token}`;

  const template = createElement(WaitlistInviteTemplate, {
    name: entry.name,
    setPasswordLink,
    assetBaseUrl,
  });

  const [html, text] = await Promise.all([
    renderEmailWithI18N(template, { lang: entry.locale }),
    renderEmailWithI18N(template, { lang: entry.locale, plainText: true }),
  ]);

  const i18n = await getI18nInstance(entry.locale);

  await mailer.sendMail({
    to: { address: user.email, name: user.name || entry.name },
    from: DOCUMENSO_INTERNAL_EMAIL,
    subject: i18n._(msg`Your Docverse access is ready`),
    html,
    text,
  });
};
