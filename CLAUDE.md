# Charging Planning — rules for agents

Read `knowledge/` first (architecture, déploiement, backlog). Decisions marked **DÉCIDÉ** are settled. Keep `knowledge/backlog.md` up to date.

## Structure

- `components/*` are deployable units, each with its own Dockerfile. `libs/*` are shared packages, never deployed alone.
- `libs/planner` is the pure planning engine: no I/O, no framework, no `Date.now()` hidden inside (time comes from the caller). Every household-specific value is a `Household` parameter, never a module constant.
- `libs/contracts` is the single source of API DTOs (zod schema → inferred type), used by api and web. Never redeclare a DTO.
- One path alias only: `@/*` → `src/*`.

## Hard rules

- No personal data in the repository: tests and demo use the fictional household of `libs/planner/src/demo.ts`. Never commit real names, addresses, schedules or tokens.
- No `any`. Functions ≤ 35 lines, files ≤ 500 lines (lint warns).
- No third-party paid service on the critical path. Never wake the Tesla; read cached vehicle data only.
- Secrets only through environment variables / GitHub environment secrets.
- Conventional commits (`feat(web): …`, `fix(planner): …`, `infra: …`, `docs: …`); PRs are squash-merged, the title drives semantic-release.

## Stack

Node 26, pnpm + Turborepo, TypeScript 5.9 strict. Web: Nuxt 4 SSR, Pinia, Vitest. API: NestJS 11 on Fastify, Kysely + raw SQL migrations, zod config. Deploy: GHCR images, Terraform (docker provider) on the Raspberry Pi, host nginx.
