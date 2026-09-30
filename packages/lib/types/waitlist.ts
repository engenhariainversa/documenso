import { z } from 'zod';

import { zEmail } from '../utils/zod';
import { ZNameSchema } from './name';

/**
 * Languages of the landing page, recorded on each entry so the emails follow the
 * language the person used.
 */
export const WAITLIST_LOCALES = ['pt-BR', 'en'] as const;

export type WaitlistLocale = (typeof WAITLIST_LOCALES)[number];

/**
 * Error message of the disposable-email refusal. The landing page matches on it to show
 * a specific text; every other refusal is shown as a generic error.
 */
export const WAITLIST_DISPOSABLE_EMAIL_MESSAGE = 'WAITLIST_DISPOSABLE_EMAIL';

/**
 * A phone part typed by a person: separators are dropped, then the digit count is checked.
 */
const zPhoneDigits = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\D+/g, ''))
    .pipe(z.string().min(min).max(max));

/**
 * Payload of the public waitlist form. Shared by the tRPC route and the landing page.
 */
/** E.164 allows at most 15 digits after the "+". */
const E164_MAX_DIGITS = 15;

export const ZJoinWaitlistRequestSchema = z
  .object({
    name: ZNameSchema,
    email: z.string().trim().toLowerCase().max(254).pipe(zEmail()),
    phoneCountry: zPhoneDigits(1, 4).refine((value) => /[1-9]/.test(value), 'Country code cannot be zero'),
    phoneArea: zPhoneDigits(1, 5),
    phoneNumber: zPhoneDigits(6, 12),
    locale: z.enum(WAITLIST_LOCALES),
    consent: z.literal(true),
    consentVersion: z.string().min(1).max(20),
    /** Honeypot: people never see this field, bots fill it. */
    website: z.string().max(200).optional(),
    captchaToken: z.string().trim().optional(),
  })
  .refine(
    ({ phoneCountry, phoneArea, phoneNumber }) =>
      phoneCountry.replace(/^0+/, '').length + phoneArea.length + phoneNumber.length <= E164_MAX_DIGITS,
    { message: 'Phone number is too long', path: ['phoneNumber'] },
  );

export type TJoinWaitlistRequest = z.infer<typeof ZJoinWaitlistRequestSchema>;

export const ZJoinWaitlistResponseSchema = z.object({
  ok: z.literal(true),
});

export type TJoinWaitlistResponse = z.infer<typeof ZJoinWaitlistResponseSchema>;
