# syntax=docker/dockerfile:1
# Moonlang image (ADR-004). One image, three roles in docker-compose.yml:
# - target "runner": the web service (`node server.js`) and the scheduler (`node scheduler.mjs`);
# - target "tools": the one-shot migrate service (schema migrations and seed).
# Base images are pinned and at least 7 days old, like the npm packages (ADR-003).

FROM node:24.22.1-alpine3.24 AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
# pnpm comes from the "packageManager" field; install scripts stay blocked (pnpm-workspace.yaml).
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# Git does not keep empty folders: make sure public/ exists for the runner stage.
RUN mkdir -p public
# Build-time placeholders: env.ts validates these when pages are collected.
# Real values are only given to the running containers.
RUN BETTER_AUTH_SECRET=build-only-placeholder-secret-not-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    pnpm build

FROM deps AS tools
ENV NODE_ENV=production
COPY . .
USER node
# Applies the versioned migrations in drizzle/ and ensures plans, settings and
# (when SEED_ROOT_EMAIL/SEED_ROOT_PASSWORD are set) the root account.
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && node_modules/.bin/tsx --tsconfig tsconfig.scripts.json scripts/seed.ts"]

FROM base AS runner
ENV NODE_ENV=production \
    MOONLANG_CONTAINER=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY scripts/scheduler.mjs ./scheduler.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
