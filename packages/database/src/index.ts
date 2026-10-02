import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __shopcloud_prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__shopcloud_prisma__ ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__shopcloud_prisma__ = prisma;
}
