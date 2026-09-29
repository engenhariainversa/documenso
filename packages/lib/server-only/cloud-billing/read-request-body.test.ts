import { describe, expect, it } from 'vitest';

import { readRequestBodyWithLimit } from './read-request-body';

const LIMIT = 1024;

const buildChunkedRequest = (chunks: string[]) => {
  const encoder = new TextEncoder();

  let pulled = 0;

  const body = new ReadableStream<Uint8Array>(
    {
      pull: (controller) => {
        if (pulled >= chunks.length) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(chunks[pulled]));
        pulled += 1;
      },
    },
    // No read-ahead: a chunk is only produced when someone actually reads.
    { highWaterMark: 0 },
  );

  const request = new Request('http://127.0.0.1/webhook', {
    method: 'POST',
    body,
    // @ts-expect-error Required by Node to send a stream, missing from the DOM types.
    duplex: 'half',
  });

  return { request, getPulledChunks: () => pulled };
};

describe('readRequestBodyWithLimit', () => {
  it('reads a body within the limit', async () => {
    const request = new Request('http://127.0.0.1/webhook', { method: 'POST', body: '{"ok":true}' });

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBe('{"ok":true}');
  });

  it('reads a body of exactly the limit', async () => {
    const request = new Request('http://127.0.0.1/webhook', { method: 'POST', body: 'a'.repeat(LIMIT) });

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBe('a'.repeat(LIMIT));
  });

  it('returns an empty string for a request without a body', async () => {
    const request = new Request('http://127.0.0.1/webhook', { method: 'POST' });

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBe('');
  });

  it('returns null for a body one byte over the limit', async () => {
    const request = new Request('http://127.0.0.1/webhook', { method: 'POST', body: 'a'.repeat(LIMIT + 1) });

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBeNull();
  });

  it('counts bytes, not characters', async () => {
    const request = new Request('http://127.0.0.1/webhook', { method: 'POST', body: 'ã'.repeat(LIMIT / 2 + 1) });

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBeNull();
  });

  it('refuses a declared length over the limit without reading the body', async () => {
    const { request, getPulledChunks } = buildChunkedRequest(['a'.repeat(10)]);

    request.headers.set('content-length', String(LIMIT + 1));

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBeNull();
    expect(getPulledChunks()).toBe(0);
  });

  it('stops reading a stream without a declared length once it passes the limit', async () => {
    const chunks = Array.from({ length: 1000 }, () => 'a'.repeat(512));

    const { request, getPulledChunks } = buildChunkedRequest(chunks);

    expect(request.headers.get('content-length')).toBeNull();
    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBeNull();

    // 512 bytes per chunk and a 1024 byte limit: the third chunk already exceeds it.
    expect(getPulledChunks()).toBeLessThan(10);
  });

  it('reads a stream without a declared length that fits', async () => {
    const { request } = buildChunkedRequest(['{"a":', '1}']);

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBe('{"a":1}');
  });

  it('keeps multi-byte characters split across chunks intact', async () => {
    const bytes = new TextEncoder().encode('ação');

    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        // Split in the middle of the two bytes of "ç".
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });

    const request = new Request('http://127.0.0.1/webhook', {
      method: 'POST',
      body,
      // @ts-expect-error Required by Node to send a stream, missing from the DOM types.
      duplex: 'half',
    });

    expect(await readRequestBodyWithLimit({ request, maxBytes: LIMIT })).toBe('ação');
  });
});
