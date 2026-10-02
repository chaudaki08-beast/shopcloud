import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(@Res() res: Response) {
    const health = await this.healthService.getHealthStatus();
    const statusCode = health.status === 'healthy' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json(health);
  }

  @Get('liveness')
  getLiveness(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({ status: 'UP' });
  }
}
