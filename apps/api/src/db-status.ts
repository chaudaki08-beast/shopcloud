import { prisma } from '@shopcloud/database';

let dbHealthy: boolean | null = null;
let lastChecked = 0;
const CHECK_INTERVAL_MS = 60000; // 60s cache

export async function isDatabaseOnline(): Promise<boolean> {
  const now = Date.now();
  if (dbHealthy !== null && now - lastChecked < CHECK_INTERVAL_MS) {
    return dbHealthy;
  }
  lastChecked = now;

  try {
    const ping = prisma.$queryRaw`SELECT 1`;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB connection timeout')), 400),
    );
    await Promise.race([ping, timeout]);
    dbHealthy = true;
    return true;
  } catch {
    dbHealthy = false;
    return false;
  }
}
