import {
  redactSensitiveData,
  redactString,
  parseCloudTraceContext,
  parseTraceparent,
  extractTraceContext,
  extractCorrelationId,
  isSensitiveKey,
} from '@shopcloud/contracts';
import { StructuredLoggerService } from './structured-logger.service';
import { CorrelationMiddleware } from './correlation.middleware';
import { runWithCorrelationContext } from './correlation-context';

describe('Structured Logging & Redaction System (Phase 14)', () => {
  describe('Sensitive Key Detection', () => {
    it('should identify sensitive keys correctly', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('userPassword')).toBe(true);
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('jwtToken')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('cardNumber')).toBe(true);
      expect(isSensitiveKey('cvv')).toBe(true);
      expect(isSensitiveKey('database_url')).toBe(true);
      expect(isSensitiveKey('db_url')).toBe(true);
    });

    it('should preserve non-sensitive business keys', () => {
      expect(isSensitiveKey('orderId')).toBe(false);
      expect(isSensitiveKey('orderNumber')).toBe(false);
      expect(isSensitiveKey('totalAmount')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
      expect(isSensitiveKey('productId')).toBe(false);
      expect(isSensitiveKey('categoryName')).toBe(false);
    });
  });

  describe('Deep Redaction Utility', () => {
    it('should redact sensitive keys in nested objects', () => {
      const payload = {
        orderId: 'ord-12345',
        customer: {
          name: 'Jane Doe',
          password: 'super-secret-password-123',
          card: {
            cardNumber: '4532123456789012',
            cvv: '999',
          },
        },
        meta: {
          token: 'jwt-access-token-xyz',
        },
      };

      const result = redactSensitiveData(payload) as any;

      expect(result.orderId).toBe('ord-12345');
      expect(result.customer.name).toBe('Jane Doe');
      expect(result.customer.password).toBe('[REDACTED]');
      expect(result.customer.card.cardNumber).toBe('[REDACTED]');
      expect(result.customer.card.cvv).toBe('[REDACTED]');
      expect(result.meta.token).toBe('[REDACTED]');
    });

    it('should sanitize credentials inside strings (Database URLs, Bearer tokens, raw JWTs)', () => {
      const logMessage =
        'Connecting to postgresql://shopcloud:secret_db_pass@127.0.0.1:5432/shopcloud with Bearer my-raw-api-token-value';
      const sanitized = redactString(logMessage);

      expect(sanitized).not.toContain('secret_db_pass');
      expect(sanitized).toContain('postgresql://shopcloud:[REDACTED]@127.0.0.1:5432/shopcloud');
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('should mask 16-digit credit card sequences embedded in strings', () => {
      const logWithCard = 'Payment attempted with card 4111 2222 3333 4444';
      const sanitized = redactString(logWithCard);

      expect(sanitized).not.toContain('4111 2222 3333 4444');
      expect(sanitized).toContain('****-****-****-4444');
    });
  });

  describe('Trace Context Parsing', () => {
    it('should parse Google Cloud Trace headers correctly', () => {
      const header = '105445aa7843bc8bf206b120001000/1234567890;o=1';
      const parsed = parseCloudTraceContext(header);

      expect(parsed).not.toBeNull();
      expect(parsed?.traceId).toBe('105445aa7843bc8bf206b120001000');
      expect(parsed?.sampled).toBe(true);
    });

    it('should parse W3C traceparent headers correctly', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const parsed = parseTraceparent(header);

      expect(parsed).not.toBeNull();
      expect(parsed?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parsed?.spanId).toBe('00f067aa0ba902b7');
      expect(parsed?.sampled).toBe(true);
    });

    it('should extract trace context from mixed headers map', () => {
      const headers = {
        'x-cloud-trace-context': 'abcd1234ef0000000000000000000000/1;o=1',
      };
      const extracted = extractTraceContext(headers);
      expect(extracted?.traceId).toBe('abcd1234ef0000000000000000000000');
    });
  });

  describe('Correlation ID Extraction', () => {
    it('should extract x-correlation-id if present', () => {
      const id = extractCorrelationId({ 'x-correlation-id': 'custom-corr-123' });
      expect(id).toBe('custom-corr-123');
    });

    it('should extract x-request-id if x-correlation-id is missing', () => {
      const id = extractCorrelationId({ 'x-request-id': 'req-abc-987' });
      expect(id).toBe('req-abc-987');
    });

    it('should generate a valid fallback correlation id if headers are empty', () => {
      const id = extractCorrelationId({});
      expect(id).toBeDefined();
      expect(id.startsWith('corr-')).toBe(true);
    });
  });

  describe('StructuredLoggerService in Production / JSON Mode', () => {
    let stdoutSpy: jest.SpyInstance;
    let stderrSpy: jest.SpyInstance;
    const origEnv = process.env.LOG_FORMAT;

    beforeEach(() => {
      process.env.LOG_FORMAT = 'json';
      stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      process.env.LOG_FORMAT = origEnv;
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it('should emit Cloud Logging compatible JSON entry with correlation context', () => {
      const logger = new StructuredLoggerService();

      runWithCorrelationContext(
        {
          correlationId: 'test-corr-uuid-42',
          traceContext: { traceId: 'trace-id-abc-123' },
          service: 'shopcloud-api',
        },
        () => {
          logger.log('Payment order placed successfully', 'TestContext');
        },
      );

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const rawLogged = stdoutSpy.mock.calls[0][0];
      const parsed = JSON.parse(rawLogged.trim());

      expect(parsed.severity).toBe('INFO');
      expect(parsed.service).toBe('shopcloud-api');
      expect(parsed.correlationId).toBe('test-corr-uuid-42');
      expect(parsed['logging.googleapis.com/trace']).toContain('trace-id-abc-123');
      expect(parsed.message).toBe('Payment order placed successfully');
    });

    it('should route errors to stderr and include bounded stack trace', () => {
      const logger = new StructuredLoggerService();
      logger.error('Database connection failed', 'Error: connection refused\n  at db.ts:10\n  at index.ts:20', 'DatabaseService');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const rawLogged = stderrSpy.mock.calls[0][0];
      const parsed = JSON.parse(rawLogged.trim());

      expect(parsed.severity).toBe('ERROR');
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Database connection failed');
      expect(parsed.error.stack).toContain('connection refused');
    });
  });

  describe('CorrelationMiddleware', () => {
    it('should set x-correlation-id on response and pass to downstream handler', () => {
      const middleware = new CorrelationMiddleware();
      const req: any = { headers: { 'x-correlation-id': 'incoming-corr-id' } };
      const setHeaderMock = jest.fn();
      const res: any = { setHeader: setHeaderMock };
      let called = false;

      middleware.use(req, res, () => {
        called = true;
      });

      expect(called).toBe(true);
      expect(setHeaderMock).toHaveBeenCalledWith('x-correlation-id', 'incoming-corr-id');
      expect(req.correlationId).toBe('incoming-corr-id');
    });
  });
});
