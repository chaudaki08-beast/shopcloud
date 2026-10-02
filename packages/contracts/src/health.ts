export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  details?: Record<string, any>;
}

export interface HealthStatusDto {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  services: {
    api: ServiceHealth;
    database: ServiceHealth;
    pubsub: ServiceHealth;
    workers: ServiceHealth;
    storage: ServiceHealth;
  };
  metrics?: {
    memoryUsageMb: number;
    activeConnections?: number;
    pubsubBacklog?: number;
  };
}
