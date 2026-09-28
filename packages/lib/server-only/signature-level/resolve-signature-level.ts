import { AppError, AppErrorCode } from '../../errors/app-error';
import { SignatureLevel, type TSignatureLevel } from '../../types/signature-level';

type ResolveSignatureLevelOptions = {
  /**
   * The signature level the caller wants the envelope created at. Optional;
   * when omitted the resolver returns the instance default (`SES`).
   */
  requested?: TSignatureLevel;

  /**
   * When `true`, a `requested` value other than `SES` throws
   * `CSC_INSTANCE_MODE_MISMATCH` rather than being silently coerced to `SES`.
   * When `false` (default), the resolver coerces incompatible inputs to
   * `SES` without throwing.
   *
   * Omitting `requested` never throws — the resolver returns `SES` either way.
   *
   * Use `strict: true` at call sites that take the level from external input
   * (e.g. a public API) where silent coercion would mask caller mistakes.
   */
  strict?: boolean;
};

/**
 * Resolve the signature level for a new envelope.
 *
 * Server-only. This fork only supports the SES signing flow (sealing with the
 * instance certificate via `signPdf`) — remote TSP-backed CSC signing (AES/
 * QES) was removed; a future ICP-Brasil qualified-signature mode will replace
 * it. Every envelope therefore resolves to `SES`.
 *
 * Source of truth for the `Envelope.signatureLevel` write at create-time. The
 * column has no DB default by design — every caller flows through here so the
 * contract is enforced consistently.
 *
 * Coerce mode (default, `strict: false`):
 *
 * | requested      | Result           |
 * |----------------|------------------|
 * | omitted        | `SES`            |
 * | `SES`          | `SES`            |
 * | `AES` / `QES`  | `SES` (coerced)  |
 *
 * Strict mode (`strict: true`): a `requested` value other than `SES` throws
 * `CSC_INSTANCE_MODE_MISMATCH` instead of silently coercing.
 */
export const resolveSignatureLevel = ({
  requested,
  strict = false,
}: ResolveSignatureLevelOptions = {}): TSignatureLevel => {
  if (requested === undefined || requested === SignatureLevel.SES) {
    return SignatureLevel.SES;
  }

  if (strict) {
    throw new AppError(AppErrorCode.CSC_INSTANCE_MODE_MISMATCH, {
      message: `signatureLevel '${requested}' is not supported on this instance — only 'SES' is permitted.`,
    });
  }

  return SignatureLevel.SES;
};
