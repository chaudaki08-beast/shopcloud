import { Injectable } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { HealthStatusDto, ServiceHealth } from '@shopcloud/contracts';
import { offlineFallbackEnabled } from '../../common/runtime-mode';

const DB_PROBE_TIMEOUT_MS = 1000;

/**
 * Readiness report. Only reports what this process actually verifies:
 * - api: this process is serving the request
 * - database: a live `SELECT 1` with measured latency
 * Pub/Sub, workers and storage are not probed by the API, so they are reported as such rather than
 * claimed healthy. Overall status follows the critical dependencies (api + database); the controller
 * returns 503 when unhealthy. Cloud Run probes use /health/liveness instead, so a database outage
 * does not restart containers.
 */
@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  async getHealthStatus(): Promise<HealthStatusDto> {
    const database = await this.probeDatabase();
    const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const notProbed = (message: string): ServiceHealth => ({ status: 'degraded', message, details: { probed: false } });

    return {
      status: database.status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      services: {
        api: { status: 'healthy', message: 'Serving requests' },
        database,
        pubsub: notProbed(
          process.env.PUBSUB_EMULATOR_HOST
            ? 'Pub/Sub emulator configured; connectivity not probed by the API'
            : 'Not probed by the API',
        ),
        workers: notProbed('Workers run as a separate service; not probed by the API'),
        storage: notProbed('Not probed by the API'),
      },
      metrics: {
        memoryUsageMb: memoryMb,
      },
    };
  }

  private async probeDatabase(): Promise<ServiceHealth> {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Database probe timed out')), DB_PROBE_TIMEOUT_MS);
        }),
      ]);
      return { status: 'healthy', latencyMs: Date.now() - started, message: 'PostgreSQL reachable' };
    } catch {
      // Local preview can still serve demo data, which is degraded rather than down.
      return offlineFallbackEnabled()
        ? { status: 'degraded', message: 'PostgreSQL unreachable; serving local demo data' }
        : { status: 'unhealthy', message: 'PostgreSQL unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }
}
