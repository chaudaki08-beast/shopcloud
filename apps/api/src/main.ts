import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { buildCorsOptions } from './common/cors';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown for Cloud Run SIGTERM/SIGINT signals
  app.enableShutdownHooks();

  // CORS allowlist from CORS_ORIGIN (see common/cors.ts)
  app.enableCors(buildCorsOptions());

  // Global prefix for all REST endpoints
  app.setGlobalPrefix('api/v1');

  // Global validation pipeline
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Standardized response envelope and error format
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Swagger / OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('ShopCloud REST API Gateway')
    .setDescription(
      'Production-grade, event-driven cloud e-commerce REST API platform engineered for Google Cloud Platform (GCP). Demonstrates strict DTO validation, finite order state-machine transitions, server-side financial calculations, and high-performance microservice architecture.',
    )
    .setVersion('2.0.0 (Phase 2)')
    .addTag('Products', 'Product catalog management, search, filtering, and allowlisted sorting')
    .addTag('Categories', 'Hierarchical product category management')
    .addTag('Cart', 'Session cart mutations with authoritative server-side financial calculations')
    .addTag('Orders', 'Atomic order placement, inventory reservation, and lifecycle state-machine')
    .addTag('Health', 'GCP Cloud Run liveness and readiness probes')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'ShopCloud API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 ShopCloud API Gateway listening on http://0.0.0.0:${port}/api/v1`);
  logger.log(`📚 OpenAPI / Swagger documentation active at http://localhost:${port}/api/docs`);
}

bootstrap();
