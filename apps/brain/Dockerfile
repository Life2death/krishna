FROM node:22-alpine AS base
RUN apk add --no-cache curl

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/brain/package.json ./apps/brain/
RUN npm ci

FROM base
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY packages/core ./packages/core
COPY apps/brain ./apps/brain

RUN addgroup -S krishna && adduser -S krishna -G krishna
USER krishna

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:8787/health || exit 1

CMD ["npx", "tsx", "apps/brain/src/index.ts"]
