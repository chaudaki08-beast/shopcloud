import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(@Res() res: Response) {
    const health = await this.healthService.getHealthStatus();
    // Degraded (e.g. local demo data) still serves traffic; only unhealthy is not ready.
    const statusCode = health.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    return res.status(statusCode).json(health);
  }

  @Get('liveness')
  getLiveness(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({ status: 'UP' });
  }
}
