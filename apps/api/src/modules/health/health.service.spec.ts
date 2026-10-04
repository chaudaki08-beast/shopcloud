import { prisma } from '@shopcloud/database';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const originalEnv = { ...process.env };
  const service = new HealthService();

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('reports the database healthy with measured latency when SELECT 1 succeeds', async () => {
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);

    const health = await service.getHealthStatus();

    expect(health.status).toBe('healthy');
    expect(health.services.database.status).toBe('healthy');
    expect(typeof health.services.database.latencyMs).toBe('number');
  });

  it('reports unhealthy in production when PostgreSQL is unreachable', async () => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connect ECONNREFUSED') as never);

    const health = await service.getHealthStatus();

    expect(health.status).toBe('unhealthy');
    expect(health.services.database).toMatchObject({ status: 'unhealthy', message: 'PostgreSQL unreachable' });
  });

  it('reports degraded (still serving demo data) outside production when PostgreSQL is unreachable', async () => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connect ECONNREFUSED') as never);

    const health = await service.getHealthStatus();

    expect(health.status).toBe('degraded');
  });

  it('never claims dependencies it does not probe are healthy', async () => {
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([] as any);

    const { services } = await service.getHealthStatus();

    for (const name of ['pubsub', 'workers', 'storage'] as const) {
      expect(services[name].status).not.toBe('healthy');
      expect(services[name].details).toEqual({ probed: false });
    }
  });
});
