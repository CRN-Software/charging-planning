# syntax=docker/dockerfile:1.7
# Build context = repo root (workspace deps needed).
ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Corepack is no longer bundled with Node ≥ 25.
RUN npm install -g pnpm@12.5.1
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY libs/tooling/package.json libs/tooling/
COPY libs/planner/package.json libs/planner/
COPY components/web/package.json components/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --filter @charging/web...

FROM deps AS build
COPY libs ./libs
COPY components/web ./components/web
RUN pnpm --filter @charging/web... build

# Nitro output is self-contained: no node_modules needed at runtime.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production NITRO_PORT=5123 NITRO_HOST=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /repo/components/web/.output ./
USER app
EXPOSE 5123
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5123/ || exit 1
CMD ["node", "server/index.mjs"]
