FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.7.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

ENV MODELS_CACHE_DIR=/app/models/hf-cache
COPY scripts/prewarm_docker_models.mjs ./scripts/prewarm_docker_models.mjs
RUN node scripts/prewarm_docker_models.mjs

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV MODELS_OFFLINE=1

EXPOSE 8080

CMD ["node", "server/index.mjs"]
