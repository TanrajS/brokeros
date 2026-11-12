# Broker OS — rules for every session

Broker OS is a renewal-first workspace for a commercial insurance brokerage. It
is built over many sessions, so architecture beats feature count. Read this file
before changing anything, and keep it current when the rules change.

## Stack (do not swap pieces)

- Next.js App Router (TypeScript strict, Cache Components on), Tailwind CSS v4,
  shadcn/ui (radix-nova style) for buttons, inputs, dialogs, tables and toasts,
  lucide-react icons, Recharts for charts.
- Neon Postgres through Drizzle ORM. Migrations live in `drizzle/` and are
  generated with `npm run db:generate`, applied with `npm run db:migrate`, and
  committed. Never edit a generated migration by hand; add a new one.
- Zod schemas in `src/lib/schemas/` are shared by client forms (react-hook-form
  + zodResolver) and server actions.
- Vitest for unit tests. CI (`.github/workflows/ci.yml`) runs typecheck, lint
  and test on every push.

## Hard constraints

1. **No login, no payments, no third-party APIs, no AI features, no analytics
   scripts.** The only secret is `DATABASE_URL`, read in `src/server/env.ts`
   and nowhere else. `.env.example` is committed; `.env*` is git-ignored. If
   `DATABASE_URL` is missing or the database is unreachable, the app renders
   `/setup` instead of crashing.
2. **Workspaces replace accounts.** A workspace has a random 10-character slug;
   its id lives in the httpOnly cookie `brokeros_workspace`. Anyone with
   `/w/[slug]` sees and edits the same data. `/` (route handler) redirects to
   the remembered workspace or to `/enter`, which creates one. Cookies are only
   written in route handlers or server actions (never during render).
3. **Business logic is pure and lives in `src/lib/domain/`.** Those files import
   no React, no database, and never call `Date.now()` or `new Date()` without
   an argument; dates arrive as `YYYY-MM-DD` strings. Every exported calculation
   returns `{ value, math }` where `math` lists inputs, the formula in words and
   intermediate steps. Every function has a test in
   `src/lib/domain/__tests__/` whose expected values are literals with a comment
   showing the hand arithmetic.
4. **Validation everywhere.** Required fields, numeric non-negative amounts,
   expiry after effective, percentages 0–100, well-formed emails. The client
   shows inline errors and disables Save until valid; the server action
   re-validates with the same Zod schema and returns `fieldErrors`. Never render
   `NaN`, `undefined` or a silent `0` for missing data: use `<Missing what=…/>`
   (an em dash with a tooltip naming what is missing).
5. **Accessibility and mobile.** Semantic HTML, visible focus rings, a label for
   every control, `aria-label` on icon buttons, the skip-to-content link, every
   main task doable with the keyboard, layouts that work at 375 px.
6. **The as-of date rules time.** Each workspace has `as_of_date` (default: the
   day it was created). Every date calculation uses it, never the real clock.
   The header shows it with a link to Settings. The only places that read the
   clock are workspace creation (`todayISO()`) and the seed CLI default.
7. **All sample data is fictional.** Invent company names, carriers, people and
   emails (`.example` domains). Never use real insurers or businesses. The
   README and the Settings About panel say so.
8. **Finish every task** by running `npm run typecheck`, `npm run lint` and
   `npm test`, updating `CHANGELOG.md`, and telling the user what you could not
   verify.

## Where things go

| Concern | Location |
| --- | --- |
| Database schema | `src/server/db/schema.ts` (every table: `id`, `workspace_id`, `created_at`, `updated_at`; money `numeric(14,2)`, rates `numeric(6,3)`) |
| Database access | Only in `src/server/**` (server actions, queries) and route handlers that call into `src/server/**` |
| Server actions | `src/server/<area>/actions.ts`, `"use server"`, return `ActionResult` from `src/server/actionResult.ts`, never throw to the client |
| Read queries | `src/server/<area>/queries.ts`, `import "server-only"` |
| Pure domain logic | `src/lib/domain/*.ts` + tests |
| Zod schemas | `src/lib/schemas/*.ts` (`z.input` = form strings, `z.output` = parsed values) |
| Display formatting | `src/lib/format/` (returns `null` for missing, never a fake value) |
| Enumerations | `src/lib/constants.ts` (shared by schema, Zod and UI) |
| Demo book | `src/server/db/seed/demoBookData.ts` (pure, takes as-of) and `demoBook.ts` (writes it) |
| Pages | `src/app/w/[slug]/…`; pages call `requireWorkspace(slug)` from `src/app/w/[slug]/lib.ts` |
| UI components | `src/components/<area>/`; shadcn primitives in `src/components/ui/` |

## Patterns to keep

- Forms: `useForm<Input, unknown, Output>({ resolver: zodResolver(schema), mode: "onChange" })`,
  send `getValues()` (raw strings) to the action, let the action re-parse. Use
  `useWatch`, not `watch` (React Compiler). Native `<select>` / checkbox via
  `NativeSelect` / `NativeCheckbox`; `<Field>` + `fieldA11y()` wire labels,
  errors and `aria-describedby`.
- After any mutation call `revalidatePath(\`/w/${slug}\`, "layout")` and
  `router.refresh()` on the client.
- Cache Components: anything that reads `params`, `cookies()` or the database
  must sit inside a Suspense boundary (`loading.tsx` or the layout's
  `<Suspense>`). Route handlers that have side effects call `await connection()`
  first so they never run at build time.
- Cache Components keeps recently visited routes hidden in the DOM (React
  `<Activity>`), so browser tests must scope locators to `main:visible` or the
  open `dialog`; a label that also exists on a hidden route is ambiguous.
- Deleting an account cascades to contacts and policies at the database level;
  the confirm dialog says so.
- Later versions add `claims`, `tower_layers`, `contract_requirements`,
  `certificates`, `submissions`, `quotes`, `quote_options`, `tasks` and
  `activities` through new migrations using the same column helpers.

## Commands

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` ·
`npm test` · `npm run db:generate` · `npm run db:migrate` · `npm run db:seed`
(`SEED_AS_OF=YYYY-MM-DD` fixes the as-of date; `SEED_WORKSPACE_SLUG=…` seeds an
existing empty workspace).
