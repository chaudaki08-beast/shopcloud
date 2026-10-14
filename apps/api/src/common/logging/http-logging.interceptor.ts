import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { StructuredLoggerService } from './structured-logger.service';
import { redactString } from '@shopcloud/contracts';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    const startTime = Date.now();
    const { method, originalUrl, ip, headers } = req;
    const sanitizedUrl = redactString(originalUrl || req.url);
    const userAgent = headers['user-agent'] || 'unknown';

    const isHealthProbe =
      sanitizedUrl.includes('/health') || sanitizedUrl.includes('/liveness');

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = res.statusCode || 200;

          const logPayload = {
            message: `${method} ${sanitizedUrl} ${statusCode} - ${durationMs}ms`,
            httpRequest: {
              requestMethod: method,
              requestUrl: sanitizedUrl,
              status: statusCode,
              latency: `${durationMs}ms`,
              userAgent,
              remoteIp: ip,
            },
          };

          // Filter high-frequency liveness probes to DEBUG to prevent log ingestion cost
          if (isHealthProbe) {
            this.logger.debug(logPayload, 'HttpAccessLog');
          } else if (statusCode >= 400) {
            this.logger.warn(logPayload, 'HttpAccessLog');
          } else {
            this.logger.log(logPayload, 'HttpAccessLog');
          }
        },
        error: (err: any) => {
          const durationMs = Date.now() - startTime;
          const statusCode = err.status || 500;

          this.logger.error(
            {
              message: `${method} ${sanitizedUrl} ${statusCode} - ${durationMs}ms (${err.message})`,
              httpRequest: {
                requestMethod: method,
                requestUrl: sanitizedUrl,
                status: statusCode,
                latency: `${durationMs}ms`,
                userAgent,
                remoteIp: ip,
              },
            },
            err.stack,
            'HttpAccessLog',
          );
        },
      }),
    );
  }
}
