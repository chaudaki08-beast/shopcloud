import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StructuredLoggerService } from './structured-logger.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

@Global()
@Module({
  providers: [
    StructuredLoggerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
  exports: [StructuredLoggerService],
})
export class LoggingModule {}
