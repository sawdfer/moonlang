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
| `pnpm db:push` | Apply the Drizzle schema to the database |
| `pnpm db:studio` | Browse the database |
| `pnpm db:seed` | Idempotent seed |

## Stack

Next.js 16 (App Router, Cache Components **off**) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PGlite locally / Neon in production · Better Auth · next-intl · Vitest.

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
- **Every UI string** goes in `messages/pt-BR.json` and `messages/en.json`, in a namespace per feature. Tone: friendly, "você", Portuguese with a bit of English.
- **Sensitive actions** (manual adjustments, payments, role changes, deletions) write to `audit_log`.
- **No secrets in code.** Use `.env.local` locally and Vercel environment variables in production.

## Database changes

- Edit only the schema file of your domain. Changes to shared tables (`auth`, `plans`) need coordination.
- During MVP development there are **no migration files**: use `pnpm db:push`. Migrations will be generated once, before the first deploy.
- Tests use `createTestDb()` from `@/test/db` (in-memory PGlite with the full schema).

## Git

- Branch from `develop`; open pull requests into `develop`.
- Commits and code in English. Reference features and rules: `feat(F-004): generate weekly lessons (RN-002)`.
- Run `pnpm check` before committing. CI also builds, audits dependencies and scans for secrets.

## Dependencies

`pnpm-workspace.yaml` only accepts versions published at least 7 days ago and blocks install scripts by default. Add exact versions (`pnpm add -E`).
