import * as net from 'net';

let dbHealthy = false;
let lastChecked = 0;
const CHECK_INTERVAL_MS = 30000;

export async function isDatabaseOnline(): Promise<boolean> {
  const now = Date.now();
  if (now - lastChecked < CHECK_INTERVAL_MS) {
    return dbHealthy;
  }
  lastChecked = now;

  return new Promise((resolve) => {
    const socket = net.createConnection({ port: 5432, host: '127.0.0.1', timeout: 80 });
    socket.on('connect', () => {
      socket.destroy();
      dbHealthy = true;
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      dbHealthy = false;
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      dbHealthy = false;
      resolve(false);
    });
  });
}
