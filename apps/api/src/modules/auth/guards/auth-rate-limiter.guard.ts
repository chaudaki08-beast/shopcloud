import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class AuthRateLimiterGuard implements CanActivate {
  private readonly hits = new Map<string, RateLimitRecord>();
  private readonly windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60000;
  private readonly maxLimit = Number(process.env.AUTH_RATE_LIMIT_MAX) || 10;

  canActivate(context: ExecutionContext): boolean {
    // In test environment, allow high throughput unless specifically testing rate limiting
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMITING) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    const record = this.hits.get(ip) || { timestamps: [] };

    // Evict older timestamps outside the current window
    const recentTimestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    if (recentTimestamps.length >= this.maxLimit) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts. Please try again later.',
          },
          timestamp: new Date().toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recentTimestamps.push(now);
    this.hits.set(ip, { timestamps: recentTimestamps });
    return true;
  }

  reset() {
    this.hits.clear();
  }
}
