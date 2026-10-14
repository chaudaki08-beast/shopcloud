/**
 * ShopCloud Shared Observability, Structured Logging & Privacy Redaction (Phase 14)
 * Provides standardized Google Cloud Logging compatibility, correlation ID propagation,
 * W3C / GCP trace parsing, and zero-leakage sensitive data redaction.
 */

export type LogSeverity =
  | 'DEFAULT'
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL';

export interface TraceContext {
  traceId: string;
  spanId?: string;
  sampled?: boolean;
}

export interface CorrelationContext {
  correlationId: string;
  traceContext?: TraceContext;
  service?: string;
  userId?: string;
  userRole?: string;
}

export interface StructuredLogEntry {
  severity: LogSeverity;
  message: string;
  timestamp: string; // ISO 8601
  service: string;
  environment?: string;
  context?: string;
  correlationId?: string;
  'logging.googleapis.com/trace'?: string;
  'logging.googleapis.com/spanId'?: string;
  'logging.googleapis.com/trace_sampled'?: boolean;
  httpRequest?: {
    requestMethod: string;
    requestUrl: string;
    status?: number;
    latency?: string;
    userAgent?: string;
    remoteIp?: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
  labels?: Record<string, string>;
}

export interface WorkerLogEventContext {
  consumerName: string;
  eventType: string;
  eventId: string;
  correlationId: string;
  aggregateType?: string;
  aggregateId?: string;
  outcome?: 'SUCCESS' | 'DUPLICATE_IGNORED' | 'FAILED';
  durationMs?: number;
  retryCount?: number;
  error?: string;
}

/**
 * List of sensitive key substrings/regex patterns that must always be redacted.
 */
const SENSITIVE_KEY_PATTERNS = [
  /passw(?:or)?d/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /auth_header/i,
  /bearer/i,
  /cookie/i,
  /set-cookie/i,
  /credit[-_]?card/i,
  /card[-_]?num(?:ber)?/i,
  /cvv/i,
  /cvc/i,
  /pan/i,
  /ssn/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /database[-_]?url/i,
  /db[-_]?url/i,
  /jwt/i,
  /webhook[-_]?secret/i,
  /signature/i,
];

/**
 * Regex patterns for masking sensitive values inside strings.
 */
const BEARER_TOKEN_REGEX = /Bearer\s+([A-Za-z0-9._~+/-]+=*)/gi;
const JWT_REGEX = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;
const DATABASE_URL_REGEX = /postgres(?:ql)?:\/\/([^:]+):([^@]+)@/gi;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;

/**
 * Determines whether an object property name indicates a sensitive field.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitizes string content by masking embedded JWTs, bearer tokens, DB credentials, and card numbers.
 */
export function redactString(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // Mask database URL passwords
  sanitized = sanitized.replace(DATABASE_URL_REGEX, 'postgresql://$1:[REDACTED]@');

  // Mask Bearer tokens
  sanitized = sanitized.replace(BEARER_TOKEN_REGEX, 'Bearer [REDACTED_TOKEN]');

  // Mask raw JWTs
  sanitized = sanitized.replace(JWT_REGEX, '[REDACTED_JWT]');

  // Mask credit card number sequences
  sanitized = sanitized.replace(CREDIT_CARD_REGEX, (match) => {
    // Only mask if it looks like a card (digits without dots or slashes)
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length >= 13 && digitsOnly.length <= 19) {
      return `****-****-****-${digitsOnly.slice(-4)}`;
    }
    return match;
  });

  return sanitized;
}

/**
 * Deeply redacts an arbitrary payload (object, array, primitive) without mutating the input.
 * Prevents circular references and limits traversal depth.
 */
export function redactSensitiveData(data: unknown, maxDepth = 6, currentDepth = 0): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return redactString(data);
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (currentDepth >= maxDepth) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: redactString(data.message),
      code: (data as any).code,
      stack: data.stack ? redactString(data.stack.split('\n').slice(0, 5).join('\n')) : undefined,
    };
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, maxDepth, currentDepth + 1));
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(data as Record<string, unknown>);

  for (const [key, value] of entries) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitiveData(value, maxDepth, currentDepth + 1);
    }
  }

  return result;
}

/**
 * Parses Google Cloud Trace header `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=TRACE_TRUE`.
 */
export function parseCloudTraceContext(header: string | undefined): TraceContext | null {
  if (!header || typeof header !== 'string') return null;

  // Format: TRACE_ID[/SPAN_ID][;o=TRACE_TRUE]
  const match = header.match(/^([a-f0-9]+)(?:\/([0-9]+))?(?:;o=([0-1]))?$/i);
  if (!match) return null;

  const [, traceId, spanId, sampled] = match;
  return {
    traceId,
    spanId: spanId ? Number(spanId).toString(16).padStart(16, '0') : undefined,
    sampled: sampled === '1',
  };
}

/**
 * Parses standard W3C `traceparent` header (e.g. 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01).
 */
export function parseTraceparent(header: string | undefined): TraceContext | null {
  if (!header || typeof header !== 'string') return null;

  const match = header.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i);
  if (!match) return null;

  const [, traceId, spanId, flags] = match;
  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 1) === 1,
  };
}

/**
 * Extracts trace context from either GCP X-Cloud-Trace-Context or W3C traceparent headers.
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>,
): TraceContext | null {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()] ?? headers[name];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const gcpTrace = getHeader('x-cloud-trace-context');
  if (gcpTrace) {
    const parsed = parseCloudTraceContext(gcpTrace);
    if (parsed) return parsed;
  }

  const w3cTrace = getHeader('traceparent');
  if (w3cTrace) {
    const parsed = parseTraceparent(w3cTrace);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Extracts correlation ID from request headers or falls back to provided or generated ID.
 */
export function extractCorrelationId(
  headers: Record<string, string | string[] | undefined>,
  fallbackId?: string,
): string {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()] ?? headers[name];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const headerId =
    getHeader('x-correlation-id') ||
    getHeader('x-request-id') ||
    getHeader('x-client-trace-id');

  if (headerId && typeof headerId === 'string' && headerId.trim().length > 0) {
    return headerId.trim();
  }

  if (fallbackId && fallbackId.trim().length > 0) {
    return fallbackId.trim();
  }

  // Generates pseudo-random UUID v4 format without external dependencies
  return 'corr-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
}
