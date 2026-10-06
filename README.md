# Charging Planning

Plan the charging of a family electric car week by week. The app reads the household calendars, works out who goes where, when and with which vehicle (including the trips nobody writes down, like going home between two activities), simulates the battery and suggests the fewest, cheapest charging sessions — workplace charger, superchargers with time-of-use tariffs — so the car never runs out.

Every guess can be corrected in a calendar view: who drives, which car, wait on site or go home, missing addresses, manual charges.

## Monorepo

| Path              | Content                                                         |
| ----------------- | --------------------------------------------------------------- |
| `libs/planner`    | Pure planning engine (trips, battery simulation, charging plan) |
| `libs/contracts`  | Shared API schemas (zod)                                        |
| `libs/tooling`    | Shared tsconfig / eslint / vitest presets                       |
| `components/web`  | Nuxt 4 app                                                      |
| `components/api`  | NestJS API                                                      |
| `infrastructure/` | Terraform (Raspberry Pi), nginx, local Docker services          |
| `knowledge/`      | Architecture, deployment, backlog (French)                      |

## Develop

Requires Node 26 and pnpm.

```sh
pnpm install
pnpm infra:up     # local Postgres
pnpm dev          # web on http://localhost:5123, api on http://localhost:6123
pnpm test         # all packages
pnpm lint && pnpm typecheck
```

Environment variables are listed in `knowledge/deploiement.md`.

## Deploy

Merging to `main` releases (semantic-release), publishes images to GHCR and deploys to the Raspberry Pi through Terraform. See `knowledge/deploiement.md`.

The demo data describes a fictional household.
