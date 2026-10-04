import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { useDatabase } from '../../../db-status';
import { rethrowInProduction } from '../../../common/runtime-mode';

interface RateLimitRecord {
  timestamps: number[];
}

/** Prune expired counter rows on roughly 1 in N requests per instance (fire-and-forget). */
const PRUNE_EVERY_N_REQUESTS = 100;

/**
 * Resolves the caller's IP without trusting client-controlled headers.
 *
 * Each trusted proxy appends the address it received the request from to X-Forwarded-For, so with
 * TRUST_PROXY_HOPS=N the client is the N-th entry from the right. Everything further left was supplied
 * by the client and is ignored (otherwise rotating a fake header would bypass the limit).
 * Cloud Run (one Google front end) and the Compose nginx proxy both use TRUST_PROXY_HOPS=1.
 */
export function resolveClientIp(req: any): string {
  const hops = Number(process.env.TRUST_PROXY_HOPS) || 0;
  if (hops > 0) {
    const chain = (req.headers?.['x-forwarded-for'] ?? '')
      .toString()
      .split(',')
      .map((entry: string) => entry.trim())
      .filter(Boolean);
    if (chain.length >= hops) {
      return chain[chain.length - hops];
    }
  }
  return req.socket?.remoteAddress || req.ip || req.connection?.remoteAddress || 'unknown-ip';
}

@Injectable()
export class AuthRateLimiterGuard implements CanActivate {
  // Local preview / DB-less fallback only; production always uses the shared AuthRateLimit table.
  private readonly hits = new Map<string, RateLimitRecord>();
  private readonly windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60000;
  private readonly maxLimit = Number(process.env.AUTH_RATE_LIMIT_MAX) || 10;
  private requestsSincePrune = 0;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // In test environment, allow high throughput unless specifically testing rate limiting
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMITING) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const ip = resolveClientIp(req);

    const allowed = (await useDatabase())
      ? await this.consumeShared(ip)
      : this.consumeLocal(ip);

    if (!allowed) {
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

    return true;
  }

  /** Fixed-window counter in PostgreSQL, atomically incremented so concurrent instances agree. */
  private async consumeShared(ip: string): Promise<boolean> {
    const windowStart = new Date(Math.floor(Date.now() / this.windowMs) * this.windowMs);
    try {
      const rows = await prisma.$queryRaw<{ hits: number }[]>`
        INSERT INTO "AuthRateLimit" ("key", "windowStart", "hits")
        VALUES (${ip}, ${windowStart}, 1)
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "hits" = "AuthRateLimit"."hits" + 1
        RETURNING "hits"`;
      this.pruneExpired(windowStart);
      return Number(rows[0].hits) <= this.maxLimit;
    } catch (err) {
      rethrowInProduction(err);
      return this.consumeLocal(ip);
    }
  }

  private pruneExpired(currentWindowStart: Date) {
    this.requestsSincePrune += 1;
    if (this.requestsSincePrune < PRUNE_EVERY_N_REQUESTS) return;
    this.requestsSincePrune = 0;
    prisma.authRateLimit
      .deleteMany({ where: { windowStart: { lt: currentWindowStart } } })
      .catch(() => undefined);
  }

  /** Sliding-window counter in process memory (local preview / DB-less tests only). */
  private consumeLocal(ip: string): boolean {
    const now = Date.now();
    const record = this.hits.get(ip) || { timestamps: [] };

    // Evict older timestamps outside the current window
    const recentTimestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    if (recentTimestamps.length >= this.maxLimit) {
      return false;
    }

    recentTimestamps.push(now);
    this.hits.set(ip, { timestamps: recentTimestamps });
    return true;
  }

  reset() {
    this.hits.clear();
  }
}
