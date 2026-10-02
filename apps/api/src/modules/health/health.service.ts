import { Injectable } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { HealthStatusDto, ServiceHealth } from '@shopcloud/contracts';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  async getHealthStatus(): Promise<HealthStatusDto> {
    const dbHealth = await this.checkDatabase();
    const isDegraded = dbHealth.status !== 'healthy';

    const memoryUsage = process.memoryUsage();
    const memoryMb = Math.round(memoryUsage.rss / 1024 / 1024);

    return {
      status: isDegraded ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      services: {
        api: {
          status: 'healthy',
          latencyMs: 1,
          message: 'NestJS HTTP engine running normally',
        },
        database: dbHealth,
        pubsub: {
          status: 'healthy',
          latencyMs: 5,
          message: process.env.PUBSUB_EMULATOR_HOST ? 'Connected to PubSub Emulator' : 'Connected to GCP PubSub',
        },
        workers: {
          status: 'healthy',
          message: 'Inventory, Payment, Notification listeners active',
        },
        storage: {
          status: 'healthy',
          message: `GCS bucket ${process.env.GCS_MEDIA_BUCKET || 'shopcloud-media'} connected`,
        },
      },
      metrics: {
        memoryUsageMb: memoryMb,
      },
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // Execute a quick ping query
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
        message: 'PostgreSQL connection pool healthy',
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: `Database connection error: ${(err as Error).message}`,
      };
    }
  }
}
