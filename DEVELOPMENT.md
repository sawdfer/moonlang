# Development guide

Technical conventions for Moonlang. Business rules (features `F-XXX`, rules `RN-XXX`) are kept outside Git, in the maintainer's local `docs/` folder.

## Setup

```sh
source scripts/env.sh        # local Node.js + pnpm from .tooling/ (see scripts/README.md)
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm db:push                 # create/update the local PGlite database in .data/
pnpm db:seed                 # root account, plans and default settings
pnpm dev
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server on http://localhost:3000 |
| `pnpm check` | Lint + type check + tests (run before every commit) |
| `pnpm build` | Production build |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm db:push` | Apply the Drizzle schema to the local database |
| `pnpm db:generate` | Create a versioned migration in `drizzle/` from schema changes |
| `pnpm db:migrate` | Apply the migrations in `drizzle/` (what production runs) |
| `pnpm db:studio` | Browse the database |
| `pnpm db:seed` | Idempotent seed |

## Stack

Next.js 16 (App Router, Cache Components **off**) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PGlite locally / PostgreSQL in production · Better Auth · next-intl · Vitest.

This Next.js version differs from older ones (e.g. `middleware` is now `src/proxy.ts`). Read `node_modules/next/dist/docs/` before using an API you are not sure about.

## Project layout

```
src/
  app/
    (public)/           public pages: home, login, invite, terms
    (app)/teacher/      staff area (teacher, admin, root)
    (app)/student/      student and trial area
    (app)/admin/        admin-only settings
    api/auth/           Better Auth handler
    api/cron/           scheduled jobs, called by the scheduler service
    api/health/         container health check
  server/<domain>/      business logic, one folder per domain
  db/schema/<domain>.ts Drizzle tables, one file per domain
  components/ui/        shared UI primitives
  i18n/, messages/      translations (pt-BR is the default)
  lib/                  framework-free helpers (money, utils, auth client)
  test/                 test helpers
```

Domains: `auth`, `people` (students, invites, consents), `classes` (class groups, enrollments, lessons, attendance), `credits`, `billing` (plans, charges, coupons, settings), `notifications`.

## Rules of thumb

- **Authorization on the server, always.** Every page, Server Action and Route Handler calls `requireUser([...roles])`, `requireStaff()` or `requireAdmin()` from `@/server/auth/session`. `src/proxy.ts` only does an optimistic redirect.
- **Students only see their own data**, and only data of their own class groups. Filter by the current user inside the server function, never by an id sent from the client.
- **Business rules are pure functions** (no DB, no `Date.now()` inside: pass `now` in) with Vitest tests that cite the rule, e.g. `it("RN-025: rounds R$ 84,50 to R$ 85")`.
- **Money is integer cents.** Format with `formatBRL`.
- **Time:** store `timestamptz` (UTC); compute and display in `America/Sao_Paulo`.
- **Meeting links** are only rendered inside authenticated pages, never in e-mails, notifications or calendar feeds.
- **Every UI string** goes in `messages/pt-BR/<feature>.json` and `messages/en/<feature>.json` (one file per feature, registered in each `index.ts`). Tone: friendly, "você", Portuguese with a bit of English.
- **Sensitive actions** (manual adjustments, payments, role changes, deletions) call `recordAudit()` from `@/server/audit`.
- **Notifications:** other domains call `notify()` and `queueWhatsApp()` from `@/server/notifications`; they never write notification tables directly.
- **Dates:** use `date-fns` with `@date-fns/tz` and the helpers in `@/lib/dates`.
- **No secrets in code.** Use `.env.local` locally and Coolify environment variables in production.

## Database changes

- Edit only the schema file of your domain. Changes to shared tables (`auth`, `plans`) need coordination.
- Locally, `pnpm db:push` syncs the schema with the PGlite database.
- Every schema change also needs a migration: run `pnpm db:generate` and commit the new file in `drizzle/`. Production only runs `drizzle-kit migrate` (never `push`). Review the generated SQL before committing, especially renames and drops.
- Tests use `createTestDb()` from `@/test/db` (in-memory PGlite with the full schema).

## Deployment

Production runs on a VPS with Coolify, behind Cloudflare (see ADR-004 in the local docs). `docker-compose.yml` defines the services, all from the `Dockerfile`:

| Service | Role |
|---|---|
| `web` | Next.js standalone server (`node server.js`) |
| `scheduler` | `node scheduler.mjs`: calls `/api/cron/*` with `CRON_SECRET` on schedule (UTC) |
| `migrate` | One-shot, before `web`: `drizzle-kit migrate` + idempotent seed |
| `postgres` | PostgreSQL 17, internal network only |
| `db-backup` | Daily `pg_dump` into the `backups` volume |
| `cloudflared` | Cloudflare Tunnel to `web:3000`; no port is published on the VPS |

- Environment variables are listed in `.env.example`. Set them in the Coolify resource, never in the repository.
- The web container trusts `CF-Connecting-IP` for the client IP, which is only safe because nothing but the tunnel reaches it. Do not publish the `web` port.
- Do not set a domain for `web` in Coolify: the public hostname lives in the tunnel configuration.
- Base images are pinned to versions at least 7 days old, like npm packages. Dependabot proposes updates.
- Docker is not needed for local development. CI builds the images on every push.

## Git

- Branch from `develop`; open pull requests into `develop`.
- Commits and code in English. Reference features and rules: `feat(F-004): generate weekly lessons (RN-002)`.
- Run `pnpm check` before committing. CI also builds, audits dependencies and scans for secrets.

## Dependencies

`pnpm-workspace.yaml` only accepts versions published at least 7 days ago and blocks install scripts by default. Add exact versions (`pnpm add -E`).
