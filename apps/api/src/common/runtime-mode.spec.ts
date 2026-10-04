import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { buildCorsOptions } from './cors';
import { offlineFallbackEnabled, requiredSecret, rethrowInProduction } from './runtime-mode';

describe('runtime-mode (Cloud Run production guards)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('outside production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('keeps offline fallbacks enabled for local preview and DB-less tests', () => {
      expect(offlineFallbackEnabled()).toBe(true);
      expect(() => rethrowInProduction(new Error('db down'))).not.toThrow();
    });

    it('returns the development default when a secret is missing', () => {
      delete process.env.SC_TEST_SECRET;
      expect(requiredSecret(['SC_TEST_SECRET'], 'dev-default')).toBe('dev-default');
    });

    it('reflects any origin when CORS_ORIGIN is "*" or unset', () => {
      expect(buildCorsOptions('*').origin).toBe(true);
      expect(buildCorsOptions(undefined).origin).toBe(true);
    });
  });

  describe('in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('disables offline fallbacks', () => {
      expect(offlineFallbackEnabled()).toBe(false);
    });

    it('turns database failures into 503 instead of serving in-memory data', () => {
      expect(() => rethrowInProduction(new Error('connect ECONNREFUSED'))).toThrow(
        ServiceUnavailableException,
      );
    });

    it('re-throws HTTP errors unchanged', () => {
      const conflict = new ConflictException('SKU exists');
      expect(() => rethrowInProduction(conflict)).toThrow(conflict);
    });

    it('fails fast when a required secret is missing', () => {
      delete process.env.SC_TEST_SECRET;
      delete process.env.SC_TEST_SECRET_LEGACY;
      expect(() => requiredSecret(['SC_TEST_SECRET', 'SC_TEST_SECRET_LEGACY'], 'dev-default')).toThrow(
        /SC_TEST_SECRET must be set/,
      );
    });

    it('uses the first configured secret name', () => {
      process.env.SC_TEST_SECRET_LEGACY = 'from-secret-manager';
      expect(requiredSecret(['SC_TEST_SECRET', 'SC_TEST_SECRET_LEGACY'], 'dev-default')).toBe(
        'from-secret-manager',
      );
    });

    it('rejects a wildcard CORS origin', () => {
      expect(() => buildCorsOptions('*')).toThrow(/not allowed/);
    });

    it('allows only listed origins, and same-origin only when unset', () => {
      expect(buildCorsOptions('https://shop.example.com, https://admin.example.com').origin).toEqual([
        'https://shop.example.com',
        'https://admin.example.com',
      ]);
      expect(buildCorsOptions(undefined).origin).toBe(false);
    });
  });
});
