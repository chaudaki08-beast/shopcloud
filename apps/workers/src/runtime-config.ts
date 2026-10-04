import { CloudEventEnvelope } from '@shopcloud/contracts';

export type DeliveryMode = 'pull' | 'push';

/**
 * Cloud Run injects PORT and only routes/probes that port, so it must win over HEALTH_PORT
 * (which Dockerfile.worker and Compose set to 8081 for local use).
 */
export function resolveHttpPort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.PORT || env.HEALTH_PORT || 8081);
}

/**
 * pull: streaming-pull subscription (local Pub/Sub emulator). Needs always-on CPU, so not for Cloud Run.
 * push: Pub/Sub POSTs each message to /pubsub/push; request-driven, scales to zero on Cloud Run.
 */
export function resolveDeliveryMode(env: NodeJS.ProcessEnv = process.env): DeliveryMode {
  const mode = (env.PUBSUB_DELIVERY || 'pull').toLowerCase();
  if (mode !== 'pull' && mode !== 'push') {
    throw new Error(`PUBSUB_DELIVERY must be "pull" or "push", got "${env.PUBSUB_DELIVERY}"`);
  }
  return mode;
}

export interface PushAuthConfig {
  audience: string;
  serviceAccountEmail: string;
}

/**
 * Push endpoints are reachable over HTTP, so in production they must verify the OIDC token Pub/Sub attaches.
 * Returns null (verification disabled) only outside production.
 */
export function resolvePushAuth(env: NodeJS.ProcessEnv = process.env): PushAuthConfig | null {
  const audience = env.PUBSUB_PUSH_AUDIENCE;
  const serviceAccountEmail = env.PUBSUB_PUSH_SERVICE_ACCOUNT;
  if (audience && serviceAccountEmail) {
    return { audience, serviceAccountEmail };
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'PUBSUB_PUSH_AUDIENCE and PUBSUB_PUSH_SERVICE_ACCOUNT are required for push delivery when NODE_ENV=production',
    );
  }
  return null;
}

export interface PushMessage {
  messageId: string;
  event: CloudEventEnvelope<any>;
}

/** Decodes a Pub/Sub push request body: { message: { data: <base64>, messageId }, subscription }. */
export function decodePushEnvelope(body: unknown): PushMessage {
  const message = (body as any)?.message;
  if (!message || typeof message.data !== 'string') {
    throw new Error('Invalid Pub/Sub push envelope: message.data missing');
  }
  const json = Buffer.from(message.data, 'base64').toString('utf8');
  return {
    messageId: String(message.messageId ?? message.message_id ?? 'unknown'),
    event: JSON.parse(json),
  };
}
