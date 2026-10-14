import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { redactSensitiveData, redactString } from '@shopcloud/contracts';
import { getActiveCorrelationId } from '../logging/correlation-context';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const correlationId = getActiveCorrelationId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected server error occurred';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        errorCode = this.mapStatusToErrorCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || exception.message;
        errorCode = resObj.code || resObj.error || this.mapStatusToErrorCode(status);

        if (Array.isArray(resObj.message)) {
          // Class validator validation errors
          errorCode = 'VALIDATION_ERROR';
          message = resObj.message.join('; ');
          details = resObj.message;
        } else if (resObj.details) {
          details = resObj.details;
        }
      }
    } else if (exception instanceof Error) {
      const sanitizedMsg = redactString(exception.message);
      const boundedStack = exception.stack
        ? redactString(exception.stack.split('\n').slice(0, 5).join('\n'))
        : undefined;
      this.logger.error(`[${correlationId}] Unhandled Exception: ${sanitizedMsg}`, boundedStack);
      message = sanitizedMsg;
    }

    const sanitizedMessage = redactString(message);
    const sanitizedDetails = details ? redactSensitiveData(details) : undefined;

    // Log 5xx errors at error level; 4xx errors at warning level
    if (status >= 500) {
      this.logger.error(`[${correlationId}] HTTP ${status} ${errorCode}: ${sanitizedMessage}`);
    } else if (status >= 400 && status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(`[${correlationId}] HTTP ${status} ${errorCode}: ${sanitizedMessage}`);
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message: sanitizedMessage,
        correlationId,
        ...(sanitizedDetails ? { details: sanitizedDetails } : {}),
      },
      timestamp: new Date().toISOString(),
    });
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
