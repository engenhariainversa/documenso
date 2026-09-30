/**
 * The schemas live in `@documenso/lib/types/waitlist` so the landing page and the
 * server share them without the lib depending on the tRPC package.
 */
export {
  type TJoinWaitlistRequest,
  type TJoinWaitlistResponse,
  WAITLIST_LOCALES,
  type WaitlistLocale,
  ZJoinWaitlistRequestSchema,
  ZJoinWaitlistResponseSchema,
} from '@documenso/lib/types/waitlist';
