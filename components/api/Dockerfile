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
COPY libs/contracts/package.json libs/contracts/
COPY components/api/package.json components/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @charging/api...

FROM deps AS build
COPY libs ./libs
COPY components/api ./components/api
RUN pnpm --filter @charging/api... build
RUN pnpm --filter @charging/api --prod deploy --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=${APP_VERSION}
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /out ./
COPY --from=build --chown=app:app /repo/components/api/migrations ./migrations
USER app
EXPOSE 6123
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:6123/api/health || exit 1
CMD ["node", "dist/main.js"]
