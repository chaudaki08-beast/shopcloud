import { Injectable, LoggerService, Scope } from '@nestjs/common';
import {
  LogSeverity,
  StructuredLogEntry,
  redactSensitiveData,
  redactString,
} from '@shopcloud/contracts';
import { getCorrelationContext } from './correlation-context';

@Injectable({ scope: Scope.DEFAULT })
export class StructuredLoggerService implements LoggerService {
  private readonly serviceName = process.env.SERVICE_NAME || 'shopcloud-api';
  private readonly environment = process.env.NODE_ENV || 'development';
  private readonly commitSha = process.env.GIT_COMMIT_SHA || process.env.K_REVISION;
  private readonly projectId =
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'project-c3f386b1-6c37-468d-8ee';
  private readonly isJson =
    process.env.LOG_FORMAT === 'json' ||
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE);

  log(message: any, context?: string) {
    this.writeLog('INFO', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.writeLog('ERROR', message, context, trace);
  }

  warn(message: any, context?: string) {
    this.writeLog('WARNING', message, context);
  }

  debug(message: any, context?: string) {
    if (this.environment === 'production' && !process.env.DEBUG) return;
    this.writeLog('DEBUG', message, context);
  }

  verbose(message: any, context?: string) {
    if (this.environment === 'production') return;
    this.writeLog('DEFAULT', message, context);
  }

  /**
   * Internal structured log writer compatible with Google Cloud Logging.
   */
  private writeLog(
    severity: LogSeverity,
    rawMessage: any,
    context?: string,
    rawTrace?: string,
  ) {
    const activeContext = getCorrelationContext();
    const correlationId = activeContext?.correlationId;
    const traceCtx = activeContext?.traceContext;

    let messageStr = '';
    let metadata: Record<string, unknown> | undefined;

    if (typeof rawMessage === 'string') {
      messageStr = redactString(rawMessage);
    } else if (rawMessage instanceof Error) {
      messageStr = redactString(rawMessage.message);
      if (!rawTrace && rawMessage.stack) {
        rawTrace = rawMessage.stack;
      }
    } else if (typeof rawMessage === 'object' && rawMessage !== null) {
      const sanitized = redactSensitiveData(rawMessage) as Record<string, unknown>;
      messageStr = typeof sanitized.message === 'string' ? (sanitized.message as string) : JSON.stringify(sanitized);
      metadata = sanitized;
    } else {
      messageStr = String(rawMessage);
    }

    if (this.isJson) {
      const entry: StructuredLogEntry = {
        severity,
        message: messageStr,
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        environment: this.environment,
        context: context || activeContext?.service,
        correlationId,
      };

      if (traceCtx?.traceId) {
        entry['logging.googleapis.com/trace'] = `projects/${this.projectId}/traces/${traceCtx.traceId}`;
        if (traceCtx.spanId) {
          entry['logging.googleapis.com/spanId'] = traceCtx.spanId;
        }
        if (typeof traceCtx.sampled === 'boolean') {
          entry['logging.googleapis.com/trace_sampled'] = traceCtx.sampled;
        }
      }

      if (rawTrace) {
        entry.error = {
          name: severity === 'ERROR' ? 'Error' : severity,
          message: messageStr,
          stack: redactString(rawTrace.split('\n').slice(0, 5).join('\n')),
        };
      }

      if (metadata && Object.keys(metadata).length > 0) {
        entry.metadata = metadata;
      }

      const jsonOutput = JSON.stringify(entry);
      if (severity === 'ERROR' || severity === 'CRITICAL') {
        process.stderr.write(jsonOutput + '\n');
      } else {
        process.stdout.write(jsonOutput + '\n');
      }
    } else {
      // Local development human-friendly format
      const timestamp = new Date().toLocaleTimeString();
      const prefix = `[${timestamp}] [${severity}]`;
      const ctxPrefix = context ? `[${context}]` : '';
      const corrPrefix = correlationId ? `[${correlationId}]` : '';

      const output = `${prefix} ${ctxPrefix} ${corrPrefix} ${messageStr}`;
      if (severity === 'ERROR' || severity === 'CRITICAL') {
        process.stderr.write(output + '\n');
        if (rawTrace) {
          process.stderr.write(redactString(rawTrace) + '\n');
        }
      } else {
        process.stdout.write(output + '\n');
      }
    }
  }
}
