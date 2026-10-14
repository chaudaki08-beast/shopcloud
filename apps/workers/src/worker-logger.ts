import {
  LogSeverity,
  StructuredLogEntry,
  WorkerLogEventContext,
  redactSensitiveData,
  redactString,
} from '@shopcloud/contracts';

export class WorkerLogger {
  private static readonly serviceName = process.env.SERVICE_NAME || 'shopcloud-workers';
  private static readonly environment = process.env.NODE_ENV || 'development';
  private static readonly isJson =
    process.env.LOG_FORMAT === 'json' ||
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE);

  static info(message: string, context?: string, metadata?: Record<string, unknown>) {
    this.write('INFO', message, context, metadata);
  }

  static warn(message: string, context?: string, metadata?: Record<string, unknown>) {
    this.write('WARNING', message, context, metadata);
  }

  static error(
    message: string,
    err?: unknown,
    context?: string,
    metadata?: Record<string, unknown>,
  ) {
    this.write('ERROR', message, context, metadata, err);
  }

  /**
   * Logs a standardized worker lifecycle event (received, processed, duplicate skip, error).
   */
  static logEvent(eventContext: WorkerLogEventContext) {
    const outcome = eventContext.outcome || 'SUCCESS';
    const severity: LogSeverity =
      outcome === 'FAILED' ? 'ERROR' : outcome === 'DUPLICATE_IGNORED' ? 'NOTICE' : 'INFO';

    const message = `[${eventContext.consumerName}] Event [${eventContext.eventType}] id=${eventContext.eventId} corr=${eventContext.correlationId} outcome=${outcome}${
      eventContext.durationMs !== undefined ? ` duration=${eventContext.durationMs}ms` : ''
    }${eventContext.retryCount !== undefined ? ` retry=${eventContext.retryCount}` : ''}`;

    this.write(severity, message, eventContext.consumerName, {
      ...eventContext,
      error: eventContext.error ? redactString(eventContext.error) : undefined,
    });
  }

  private static write(
    severity: LogSeverity,
    message: string,
    context?: string,
    metadata?: Record<string, unknown>,
    err?: unknown,
  ) {
    const sanitizedMsg = redactString(message);
    const sanitizedMeta = metadata ? (redactSensitiveData(metadata) as Record<string, unknown>) : undefined;

    let errorObj: StructuredLogEntry['error'] | undefined;
    if (err instanceof Error) {
      errorObj = {
        name: err.name,
        message: redactString(err.message),
        stack: err.stack ? redactString(err.stack.split('\n').slice(0, 5).join('\n')) : undefined,
      };
    } else if (err && typeof err === 'object') {
      errorObj = {
        name: 'WorkerError',
        message: redactString(JSON.stringify(redactSensitiveData(err))),
      };
    }

    if (this.isJson) {
      const entry: StructuredLogEntry = {
        severity,
        message: sanitizedMsg,
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        environment: this.environment,
        context,
        correlationId: sanitizedMeta?.correlationId as string | undefined,
        metadata: sanitizedMeta,
        error: errorObj,
      };

      const jsonStr = JSON.stringify(entry);
      if (severity === 'ERROR' || severity === 'CRITICAL') {
        process.stderr.write(jsonStr + '\n');
      } else {
        process.stdout.write(jsonStr + '\n');
      }
    } else {
      const timestamp = new Date().toLocaleTimeString();
      const prefix = `[${timestamp}] [${severity}]${context ? ` [${context}]` : ''}`;
      const line = `${prefix} ${sanitizedMsg}`;

      if (severity === 'ERROR' || severity === 'CRITICAL') {
        process.stderr.write(line + '\n');
        if (errorObj?.stack) {
          process.stderr.write(errorObj.stack + '\n');
        }
      } else {
        process.stdout.write(line + '\n');
      }
    }
  }
}
