# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY packages/database/package*.json ./packages/database/
COPY apps/workers/package*.json ./apps/workers/

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
COPY apps/workers ./apps/workers

RUN npm run build --workspace=@shopcloud/contracts
RUN npx prisma generate --schema=./packages/database/prisma/schema.prisma
RUN npm run build --workspace=@shopcloud/workers

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

USER node

COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node --from=builder /app/packages/database/dist ./packages/database/dist
COPY --chown=node:node --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --chown=node:node --from=builder /app/packages/database/package.json ./packages/database/
COPY --chown=node:node --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --chown=node:node --from=builder /app/apps/workers/package.json ./apps/workers/

CMD ["node", "apps/workers/dist/index.js"]
