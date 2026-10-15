import * as http from 'http';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@shopcloud/database';
import { CloudEventEnvelope } from '@shopcloud/contracts';
import { handleEvent } from './event-router';
import { WorkerLogger } from './worker-logger';
import {
  decodePushEnvelope,
  PushAuthConfig,
  PushMessage,
  resolveDeliveryMode,
  resolveHttpPort,
  resolvePushAuth,
} from './runtime-config';
import { WorkerLifecycle } from './worker-lifecycle';

/** Cloud Run allows 10 s between SIGTERM and SIGKILL; leave headroom. */
const SHUTDOWN_TIMEOUT_MS = 8000;
const MAX_PUSH_BODY_BYTES = 1024 * 1024;

const oidcClient = new OAuth2Client();

async function verifyPushToken(req: http.IncomingMessage, auth: PushAuthConfig): Promise<boolean> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return false;
  try {
    const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: auth.audience });
    const claims = ticket.getPayload();
    return claims?.email === auth.serviceAccountEmail && claims?.email_verified === true;
  } catch {
    return false;
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PUSH_BODY_BYTES) {
        reject(new Error('Push body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handlePush(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  auth: PushAuthConfig | null,
): Promise<void> {
  if (WorkerLifecycle.isShuttingDown()) {
    // 503 Service Unavailable signals Pub/Sub to backoff and re-route
    WorkerLogger.warn('Worker is draining; rejecting push message with 503', 'WorkerPush');
    res.writeHead(503, { 'Retry-After': '5' });
    res.end();
    return;
  }

  if (auth && !(await verifyPushToken(req, auth))) {
    WorkerLogger.warn('Unauthorized push delivery attempt rejected', 'WorkerPush');
    res.writeHead(401);
    res.end();
    return;
  }

  let decoded: PushMessage;
  try {
    decoded = decodePushEnvelope(JSON.parse(await readBody(req)));
  } catch (err) {
    // Pub/Sub redelivers on ANY non-2xx (4xx included); a payload that cannot be parsed never will be,
    // so log it and acknowledge instead of looping until the dead-letter limit.
    WorkerLogger.warn(`Dropping malformed push message: ${(err as Error).message}`, 'WorkerPush');
    res.writeHead(204);
    res.end();
    return;
  }

  const { messageId } = decoded;
  WorkerLifecycle.incrementInFlight();
  try {
    WorkerLogger.info(`Received push message ID: ${messageId}`, 'WorkerPush', { messageId });
    await handleEvent(decoded.event);
    // 2xx acknowledges the message
    res.writeHead(204);
    res.end();
  } catch (err) {
    WorkerLogger.error(`Error processing push message ${messageId}`, err, 'WorkerPush', { messageId });
    // Non-2xx makes Pub/Sub redeliver with backoff (and dead-letter after max attempts)
    res.writeHead(500);
    res.end();
  } finally {
    WorkerLifecycle.decrementInFlight();
  }
}

async function bootstrapWorkers() {
  WorkerLogger.info('Starting ShopCloud Event Workers Daemon...', 'WorkerBootstrap');

  const deliveryMode = resolveDeliveryMode();
  const pushAuth = deliveryMode === 'push' ? resolvePushAuth() : null;

  // HTTP server: health probes for Docker & Cloud Run, plus the Pub/Sub push endpoint in push mode
  const httpPort = resolveHttpPort();
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/liveness' || req.url === '/')) {
      const isDraining = WorkerLifecycle.isShuttingDown();
      const statusCode = isDraining ? 503 : 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: isDraining ? 'DRAINING' : 'UP',
          service: 'shopcloud-workers',
          delivery: deliveryMode,
          inFlight: WorkerLifecycle.getInFlightCount(),
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    if (deliveryMode === 'push' && req.method === 'POST' && req.url === '/pubsub/push') {
      void handlePush(req, res, pushAuth);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  httpServer.listen(httpPort, '0.0.0.0', () => {
    WorkerLogger.info(
      `HTTP server (health${deliveryMode === 'push' ? ' + /pubsub/push' : ''}) listening on 0.0.0.0:${httpPort}`,
      'WorkerBootstrap',
    );
  });

  let subscription: Subscription | null = null;

  if (deliveryMode === 'pull') {
    const projectId = process.env.GCP_PROJECT_ID || 'shopcloud-dev';
    const emulatorHost = process.env.PUBSUB_EMULATOR_HOST;

    const pubsub = new PubSub({
      projectId,
      apiEndpoint: emulatorHost,
    });

    const subscriptionName = process.env.PUBSUB_SUBSCRIPTION || 'shopcloud-inventory-sub';
    try {
      subscription = pubsub.subscription(subscriptionName);

      subscription.on('message', async (message) => {
        if (WorkerLifecycle.isShuttingDown()) {
          // NACK so another worker instance can pick it up immediately
          message.nack();
          return;
        }

        WorkerLifecycle.incrementInFlight();
        WorkerLogger.info(`Received pull message ID: ${message.id}`, 'WorkerPull', { messageId: message.id });
        try {
          const payload: CloudEventEnvelope<any> = JSON.parse(message.data.toString());
          await handleEvent(payload);
          message.ack();
        } catch (err) {
          WorkerLogger.error(`Error processing message ${message.id}`, err, 'WorkerPull', { messageId: message.id });
          message.nack();
        } finally {
          WorkerLifecycle.decrementInFlight();
        }
      });

      WorkerLogger.info(`Listening for events on subscription: ${subscriptionName}`, 'WorkerBootstrap');
    } catch (err) {
      WorkerLogger.warn(`Notice: Pub/Sub listener offline (${(err as Error).message}). Local dev mode active.`, 'WorkerBootstrap');
    }
  } else {
    WorkerLogger.info(
      `Push delivery active (OIDC verification ${pushAuth ? 'enabled' : 'DISABLED — local only'})`,
      'WorkerBootstrap',
    );
  }

  // Graceful shutdown: stop intake, wait for in-flight tasks to drain, release Pub/Sub and DB, exit before SIGKILL
  const shutdown = async (signal: string) => {
    if (WorkerLifecycle.isShuttingDown()) return;
    WorkerLifecycle.setShuttingDown(true);
    WorkerLogger.info(
      `Received ${signal}, beginning graceful drain of workers (in-flight: ${WorkerLifecycle.getInFlightCount()})...`,
      'WorkerShutdown',
    );

    const forceExit = setTimeout(() => {
      WorkerLogger.error(
        `Graceful shutdown timed out; forcing exit with ${WorkerLifecycle.getInFlightCount()} in-flight tasks remaining`,
        undefined,
        'WorkerShutdown',
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      // 1. Stop accepting new connections
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));

      // 2. Pause/close pull subscription if active
      if (subscription) await subscription.close();

      // 3. Drain active tasks (poll every 100ms for up to 6 seconds)
      const drainStart = Date.now();
      const MAX_DRAIN_WAIT_MS = 6000;
      while (WorkerLifecycle.getInFlightCount() > 0 && Date.now() - drainStart < MAX_DRAIN_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (WorkerLifecycle.getInFlightCount() > 0) {
        WorkerLogger.warn(
          `Drain timeout reached; proceeding with shutdown with ${WorkerLifecycle.getInFlightCount()} tasks still in flight`,
          'WorkerShutdown',
        );
      } else {
        WorkerLogger.info('All in-flight tasks completed cleanly.', 'WorkerShutdown');
      }

      // 4. Disconnect database connections
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      WorkerLogger.error('Error during shutdown', err, 'WorkerShutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrapWorkers();

