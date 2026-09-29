export type ReadRequestBodyWithLimitOptions = {
  request: Request;
  maxBytes: number;
};

/**
 * Read a request body as text, giving up as soon as it is known to be too large.
 *
 * Returns null when the body is over the limit. A declared length over the limit is
 * refused without reading anything. A body sent without a declared length (chunked)
 * is read from the stream and dropped once it passes the limit, so an endpoint open
 * to the internet never holds more than the limit in memory.
 */
export const readRequestBodyWithLimit = async ({ request, maxBytes }: ReadRequestBodyWithLimitOptions) => {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null;
  }

  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => null);

      return null;
    }

    chunks.push(value);
  }

  // Decoded once at the end, so a character split across two chunks stays intact.
  return Buffer.concat(chunks).toString('utf8');
};
