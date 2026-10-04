import * as http from 'http';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@shopcloud/database';
import { CloudEventEnvelope } from '@shopcloud/contracts';
import { handleEvent } from './event-router';
import {
  decodePushEnvelope,
  PushAuthConfig,
  PushMessage,
  resolveDeliveryMode,
  resolveHttpPort,
  resolvePushAuth,
} from './runtime-config';

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
  if (auth && !(await verifyPushToken(req, auth))) {
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
    console.error('[Worker] Dropping malformed push message:', (err as Error).message);
    res.writeHead(204);
    res.end();
    return;
  }

  const { messageId } = decoded;
  try {
    console.log(`[Worker] Received push message ID: ${messageId}`);
    await handleEvent(decoded.event);
    // 2xx acknowledges the message
    res.writeHead(204);
    res.end();
  } catch (err) {
    console.error(`[Worker] Error processing push message ${messageId}:`, err);
    // Non-2xx makes Pub/Sub redeliver with backoff (and dead-letter after max attempts)
    res.writeHead(500);
    res.end();
  }
}

async function bootstrapWorkers() {
  console.log('⚡ Starting ShopCloud Event Workers Daemon...');

  const deliveryMode = resolveDeliveryMode();
  const pushAuth = deliveryMode === 'push' ? resolvePushAuth() : null;

  // HTTP server: health probes for Docker & Cloud Run, plus the Pub/Sub push endpoint in push mode
  const httpPort = resolveHttpPort();
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/liveness' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'UP',
          service: 'shopcloud-workers',
          delivery: deliveryMode,
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
    console.log(`[Worker] HTTP server (health${deliveryMode === 'push' ? ' + /pubsub/push' : ''}) on 0.0.0.0:${httpPort}`);
  });

  let subscription: Subscription | null = null;

  if (deliveryMode === 'pull') {
    const projectId = process.env.GCP_PROJECT_ID || 'shopcloud-dev';
    const emulatorHost = process.env.PUBSUB_EMULATOR_HOST;

    const pubsub = new PubSub({
      projectId,
      apiEndpoint: emulatorHost,
    });

    const subscriptionName = `${projectId}-inventory-sub`;
    try {
      subscription = pubsub.subscription(subscriptionName);

      subscription.on('message', async (message) => {
        console.log(`[Worker] Received message ID: ${message.id}`);
        try {
          const payload: CloudEventEnvelope<any> = JSON.parse(message.data.toString());
          await handleEvent(payload);
          message.ack();
        } catch (err) {
          console.error(`[Worker] Error processing message ${message.id}:`, err);
          message.nack();
        }
      });

      console.log(`[Worker] Listening for events on subscription: ${subscriptionName}`);
    } catch (err) {
      console.warn(`[Worker] Notice: Pub/Sub listener offline (${(err as Error).message}). Local dev mode active.`);
    }
  } else {
    console.log(`[Worker] Push delivery active (OIDC verification ${pushAuth ? 'enabled' : 'DISABLED — local only'})`);
  }

  // Graceful shutdown: stop intake, release Pub/Sub and database connections, exit before SIGKILL
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down workers gracefully...`);

    const forceExit = setTimeout(() => {
      console.error('Graceful shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (subscription) await subscription.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrapWorkers();
