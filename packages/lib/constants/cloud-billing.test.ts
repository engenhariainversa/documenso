import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  IS_CLOUD_BILLING_ENABLED,
  IS_CLOUD_BILLING_PROVIDER_CONFIGURED,
  OPAPINGOU_API_KEY,
  OPAPINGOU_API_URL,
  OPAPINGOU_DEFAULT_API_URL,
  OPAPINGOU_WEBHOOK_SECRET,
} from './cloud-billing';

describe('cloud billing constants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('IS_CLOUD_BILLING_ENABLED', () => {
    it.each([undefined, '', 'false', '1', 'TRUE', ' true'])('is disabled for %j', (value) => {
      vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', value);

      expect(IS_CLOUD_BILLING_ENABLED()).toBe(false);
    });

    it('is enabled only for the exact string "true"', () => {
      vi.stubEnv('NEXT_PUBLIC_CLOUD_BILLING_ENABLED', 'true');

      expect(IS_CLOUD_BILLING_ENABLED()).toBe(true);
    });
  });

  describe('OPAPINGOU_API_URL', () => {
    it('falls back to the default URL', () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', undefined);

      expect(OPAPINGOU_API_URL()).toBe(OPAPINGOU_DEFAULT_API_URL);
    });

    it('falls back to the default URL when empty', () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', '  ');

      expect(OPAPINGOU_API_URL()).toBe(OPAPINGOU_DEFAULT_API_URL);
    });

    it('strips trailing slashes from a configured URL', () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', 'http://127.0.0.1:9999/v1//');

      expect(OPAPINGOU_API_URL()).toBe('http://127.0.0.1:9999/v1');
    });

    it.each([
      'https://api-stg.opapingou.com.br',
      'https://api-stg.opapingou.com.br/',
    ])('appends /v1 when %s is configured without it', (value) => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_URL', value);

      expect(OPAPINGOU_API_URL()).toBe('https://api-stg.opapingou.com.br/v1');
    });
  });

  describe('secrets', () => {
    it.each([undefined, '', '   '])('treats %j as a missing API key', (value) => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', value);

      expect(OPAPINGOU_API_KEY()).toBeUndefined();
    });

    it.each([undefined, '', '   '])('treats %j as a missing webhook secret', (value) => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', value);

      expect(OPAPINGOU_WEBHOOK_SECRET()).toBeUndefined();
    });

    it('returns the configured values', () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', 'key-for-tests');
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', 'secret-for-tests');

      expect(OPAPINGOU_API_KEY()).toBe('key-for-tests');
      expect(OPAPINGOU_WEBHOOK_SECRET()).toBe('secret-for-tests');
    });
  });

  describe('IS_CLOUD_BILLING_PROVIDER_CONFIGURED', () => {
    it('requires both the API key and the webhook secret', () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', 'key-for-tests');
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', '');

      expect(IS_CLOUD_BILLING_PROVIDER_CONFIGURED()).toBe(false);

      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', '');
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', 'secret-for-tests');

      expect(IS_CLOUD_BILLING_PROVIDER_CONFIGURED()).toBe(false);
    });

    it('is configured when both are present', () => {
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_API_KEY', 'key-for-tests');
      vi.stubEnv('NEXT_PRIVATE_OPAPINGOU_WEBHOOK_SECRET', 'secret-for-tests');

      expect(IS_CLOUD_BILLING_PROVIDER_CONFIGURED()).toBe(true);
    });
  });
});
