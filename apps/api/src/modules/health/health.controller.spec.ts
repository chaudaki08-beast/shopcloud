import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const mockHealthService = {
      getHealthStatus: jest.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSeconds: 120,
        services: {
          api: { status: 'healthy', latencyMs: 1 },
          database: { status: 'healthy', latencyMs: 5 },
          pubsub: { status: 'healthy' },
          workers: { status: 'healthy' },
          storage: { status: 'healthy' },
        },
        metrics: { memoryUsageMb: 64 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should return UP on liveness probe', () => {
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    controller.getLiveness(mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockRes.json).toHaveBeenCalledWith({ status: 'UP' });
  });

  it('should return healthy status on full health check probe', async () => {
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await controller.getHealth(mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'healthy' }),
    );
  });
});
