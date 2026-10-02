# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and workspace definitions
COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY packages/database/package*.json ./packages/database/
COPY apps/api/package*.json ./apps/api/

# Install dependencies
RUN npm ci

# Copy source files
COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
COPY apps/api ./apps/api

# Build shared contracts
RUN npm run build --workspace=@shopcloud/contracts

# Generate Prisma Client
RUN npx prisma generate --schema=./packages/database/prisma/schema.prisma

# Build NestJS API
RUN npm run build --workspace=@shopcloud/api

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install non-root user
USER node

# Copy built artifacts and production node_modules
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node --from=builder /app/packages/database/dist ./packages/database/dist
COPY --chown=node:node --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --chown=node:node --from=builder /app/packages/database/package.json ./packages/database/
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
