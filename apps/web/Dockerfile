# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY apps/web/package*.json ./apps/web/

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

RUN npm run build --workspace=@shopcloud/contracts
RUN npm run build --workspace=@shopcloud/web

# Stage 2: Serve via Nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
