import { describe, expect, it } from 'vitest';

import { APP_NAME, APP_SOURCE_URL, APP_UPSTREAM_URL } from './brand';

describe('brand', () => {
  it('exposes the Docverse identity', () => {
    expect(APP_NAME).toBe('Docverse');
    expect(APP_SOURCE_URL).toBe('https://github.com/engenhariainversa/documenso');
    expect(APP_UPSTREAM_URL).toBe('https://github.com/documenso/documenso');
  });
});
