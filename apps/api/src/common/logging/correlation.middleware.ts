import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  extractCorrelationId,
  extractTraceContext,
  CorrelationContext,
} from '@shopcloud/contracts';
import { runWithCorrelationContext } from './correlation-context';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = extractCorrelationId(req.headers as Record<string, string | undefined>);
    const traceContext = extractTraceContext(req.headers as Record<string, string | undefined>) || undefined;

    // Echo correlation ID back to the client in response headers
    res.setHeader('x-correlation-id', correlationId);

    // Attach to request object for easy access in handlers/interceptors
    (req as any).correlationId = correlationId;
    (req as any).traceContext = traceContext;

    const context: CorrelationContext = {
      correlationId,
      traceContext,
      service: 'shopcloud-api',
    };

    runWithCorrelationContext(context, () => {
      next();
    });
  }
}
