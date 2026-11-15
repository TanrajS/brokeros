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
| Demo book | `src/server/db/seed/demoBookData.ts` (pure, takes as-of; `buildDemoBook` = the 14-account base every test pins, `buildFullDemoBook` adds the five v1.3 accounts the seed writes) and `demoBook.ts` (writes it); `demoBookDashboard.ts` / `demoBookLossRuns.ts` / `demoBookProgram.ts` / `demoBookMarketing.ts` / `demoBookStrategy.ts` map it for tests |
| Pages | `src/app/w/[slug]/…`; pages call `requireWorkspace(slug)` from `src/app/w/[slug]/lib.ts`. Account tabs live in the route group `accounts/[accountId]/(tabs)/` (layout = header + `AccountTabs`); edit and policy pages sit outside the group. `/placement/…` only redirects |
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
- Server HTML renders react-hook-form inputs empty; they fill on hydration.
  Browser tests must `waitForLoadState("networkidle")` before reading values.
- A horizontal scroll container must be `relative`, or `sr-only` text inside it
  (absolutely positioned) escapes the clipping and widens the whole page.
- A centred page block inside a flex column (`mx-auto max-w-…`) also needs
  `w-full`, or it sizes to its tables' min-content and overflows at 375 px.
- A Zod rule that spans two fields (cap ≥ deductible) must be re-triggered when
  the other field changes (`useWatch` + `trigger`), or react-hook-form shows the
  error only when the field carrying it is edited last.
- Checkbox toggles backed by server state use `useOptimistic` so they flip
  immediately.
- Filter forms that should produce shareable URLs use `CleanGetForm`, and the
  page redirects to the canonical URL if empty params arrive anyway.
- Deleting an account cascades to contacts and policies at the database level;
  the confirm dialog says so.
- v0.2 added `checklist_items`, `tasks`, `activities` and `renewal_outcomes`.
  Later versions add `claims`, `contract_requirements`, `certificates`,
  `submissions`, `quotes`, `quote_options`, `program_layers`,
  `layer_participations` and `policy_deductibles` through new migrations using
  the same column helpers. `tower_layers` (v1) was converted into
  `program_layers` + `layer_participations` by `0007_convert_tower_layers` and
  dropped in `0008`; a data-moving migration is written with
  `drizzle-kit generate --custom`, never by editing a generated file. When `claims` arrives, wire its
  count into `checkUndoOutcome` in `src/server/outcomes/actions.ts` (it passes 0
  today).

## Renewals rules (v0.2)

- **Stage is derived, never stored as truth.** `getRenewalStage(days, status)`
  in `src/lib/domain/renewals.ts` is the only source. `policies.last_logged_stage`
  exists only to detect changes: after anything that can move a stage (as-of
  date change, policy create/edit, outcome record/undo) call
  `syncStages(executor, workspaceId, asOf, [ids])` from
  `src/server/renewals/stages.ts`, which logs an activity per move and
  initialises never-logged policies silently.
- **Closed statuses (renewed, lost, non_renewed) only come from outcomes.** The
  policy form offers only open statuses; the server rejects closed ones and locks
  the status once an outcome exists. Only Undo outcome reverses one.
- **Multi-write operations use `withTransaction`** from `src/server/db/tx.ts`
  (a short-lived Neon WebSocket pool; the HTTP driver cannot hold a
  transaction). Lock the row with `.for("update")` before checking state.
  Helpers that run in either context take an `Executor`; use `getExecutor()` for
  the HTTP client. No casts needed.
- **The Book counts current terms only**: a policy that is some other policy's
  `previous_policy_id` is superseded and excluded from totals and next expiry.
- Checklists are generated on first open by `ensureChecklist` (idempotent; the
  unique `(policy_id, label)` index guards double runs). Before that, readiness
  is computed from the template as 0 of N.
- Activities are ordered newest first by `as_of_date`, then `created_at`.

## Dashboard rules (v0.3)

- **All metrics are pure functions in `src/lib/domain/dashboard.ts`** taking
  `DashPolicy[]` / `DashAccount[]`, the as-of date and `DateWindow`s.
  `src/server/dashboard/queries.ts` only fetches rows and maps them to those
  shapes. Never compute a metric in a component or query.
- **Windows:** lookback = (as-of − N months + 1 day) … as-of; forward =
  (as-of + 1 day) … (as-of + N months); both inclusive, never overlapping.
- **In force** = effective ≤ as-of < expiry and status not lost/non-renewed.
  **Open** = no outcome and status not_started/in_progress.
- **Resolved** (retention) = expiry in the lookback window; an expired policy
  without an outcome is "unresolved, treated as lost". Ratios return `null`
  (never NaN) when the denominator is 0; render `<Missing>`.
- Every tile shows `math.steps.lines` through `<ShowMath>`. Currency has no
  decimals; percentages one decimal via `formatRatioPercent`.
- The demo seed is tuned so the 12-month window gives exactly 87.5% / 80.0%
  (`src/server/db/seed/__tests__/demoBookDashboard.test.ts`) and one carrier
  holds about 40% of in-force premium. Any seed change must keep those tests
  passing.
- Charts: one series uses `#2a78d6`, columns ≤ 24px with 4px rounded tops,
  hairline grid, and always a table view with the same data and links. The
  chart itself is `aria-hidden`. A second series uses `#eb6834`.

## Loss runs rules (v0.4)

- **All loss-run logic is in `src/lib/domain/lossRuns.ts`** (`LRPolicy[]`,
  `LRClaim[]`, as-of date in). `src/server/lossRuns/queries.ts` only maps rows.
  Incurred and policy year are never stored.
- **Policy periods** come from the account's policies in the line plus their
  `previous_policy_id` chain; a claim belongs to the period with effective ≤
  loss < expiry. Claims outside every period are flagged and excluded from year
  summaries.
- **CSV import validation is one function, `validateImportRows`**, used by the
  client preview and re-run by the `importClaims` action, which inserts all valid
  rows in one `withTransaction`. Never insert row by row outside a transaction.
- Claims with a blank policy are auto-linked on save/import to the policy whose
  term contains the loss date.
- Undo outcome refuses when the successor has claims (`checkUndoOutcome`).
- The demo seed's Harbourline and Cedar Ridge GL chains and claims are the
  hand-verification cases (`src/server/db/seed/__tests__/demoBookLossRuns.test.ts`);
  they must keep passing alongside the v0.3 retention test.
- The loss-ratio chart uses a second y-axis because the spec asked for it; the
  dataviz guidance discourages dual axes, so keep both axes starting at zero,
  the legend naming each axis, and the table beneath.
- Browser tests: React `<Activity>` can keep the previous page hidden inside the
  same `<main>`; use `.filter({ visible: true })` when text may appear on both.

## Program rules (v1)

- **All program logic is in `src/lib/domain/program.ts`**: `analyzeTower`,
  `checkRequirements`, `certificateStatus`, `coinsurancePayment`,
  `analyzeParticipation`. `src/server/program/queries.ts` maps rows with
  `toProgramPolicy` / `toTowerInput` / `toRequirementInput` /
  `toCertificateInput`; the Program page does the computing.
- **Certificate status is derived, never stored.** `listCertificatesDue` feeds
  the Renewals panel; `listAccountCertificates` the Account page.
- **The checker uses current terms only** (no successor, expiry after as-of)
  and the selected line group's tower for umbrella/excess limits. Umbrella never
  counts toward an aggregate.
- **Checker and adequacy never say compliant / adequate.** Labels are Meets,
  Shortfall $X, Missing coverage, or the arithmetic; the decision is the user's.
- **Tower diagram:** blocks are `flex: span 1 0%` so one markup works as a
  column (md+) and a row (mobile); gaps hatched red, overlaps amber; the table
  beside carries every figure.
- **Participants and sub-limits** cascade with their policy. The policy's own
  `carrier` is the lead insurer; participants are the full schedule.
- The demo program cases (Harbourline tower/contract/certificates, Cedar gap and
  adequacy, Kestrel participants) are checked in
  `src/server/db/seed/__tests__/demoBookProgram.test.ts`.

## Marketing rules (v1.1)

- **All marketing logic is in `src/lib/domain/marketing.ts`**: `checkTransition`,
  `canRecordQuote`, `daysToRespond`, `isQuoteExpired`, `compareQuotes`,
  `normaliseQuotes`, `marketLog`. Actions in `src/server/marketing/actions.ts`
  must call `checkTransition` before any status change; `bindQuote` and
  `unbindSubmission` run in `withTransaction` with the policy row locked.
- **Status is stored but moves only through the rules**; days to respond is
  derived from `sent_on` / `responded_on`, never stored.
- **Comparison never scores.** Show "N of M terms match" and list every
  mismatch; commission is always shown beside the client cost.
- **Normalise = limits and deductible match the target.** Endorsements do not
  exclude. Against a contract requirement, "match" means "meets".
- **Binding** sets `quotes.is_bound` and the submission to bound, then sends the
  user to the policy page with `?outcome=renewed`; `recordRenewedOutcome` copies
  the bound quote's endorsements onto the successor.
- `buildMarketingView` (`src/server/marketing/view.ts`) is shared by the tab and
  the printable summary. Print styles: app chrome carries `print:hidden`.
- The demo marketing case is checked in
  `src/server/db/seed/__tests__/demoBookMarketing.test.ts`.

## Strategy rules (v1.2)

- **All strategy logic is in `src/lib/domain/strategy.ts`**:
  `groupClaimsByPolicyYear`, `selectReplayYears`, `replayYear`,
  `analyzeRetentionOptions`, `totalCostOfRisk`, `otherLineRetained`,
  `considerations`, `assumptionsAndLimitations`. `buildStrategyView`
  (`src/server/strategy/view.ts`) is the one place that assembles them and is
  shared by the tab, the report and the JSON export; pages never recompute.
- **Settings live in the URL** (`policy`, `years`, `current=0`, `trend`, `ldf`)
  through `src/components/strategy/params.ts`, so the tab, the report and the
  export always agree on the basis. The basis in use is stated on the page and
  in the report's Assumptions section, which is generated, never hand-written.
- **The base is the lowest deductible** (ties: lowest premium). Nothing marks an
  option recommended; the Considerations panel is neutral (favours lower /
  favours higher). The report never says what the client should buy.
- **Replay arithmetic:** retained = Σ min(adjusted incurred, deductible), then
  min(·, cap); adjustments (trend, development) apply per claim before the
  deductible. The running year counts as a full year when included and is
  labelled incomplete.
- **TCOR premiums are in-force current terms** (the v0.3 rule) with the option's
  premium in place of the analysed line; other lines without loss runs count as
  zero and are flagged, never silently.
- `quote_options.source_quote_id` is kept (ON DELETE SET NULL) so the report
  can say which premiums came from quotes and which were entered by hand.
- The demo strategy cases (Harbourline, Cedar Ridge) are checked in
  `src/server/db/seed/__tests__/demoBookStrategy.test.ts`.

## Placement rules (v1.3)

- **Subscription placements live in `src/lib/domain/program.ts`**:
  `layerSummary`, `coverageProfile`, `programTotals`, `signDown`,
  `towerInputsFrom` (feeds a tower to `analyzeTower` for the v0.5 gap and
  overlap checks), `isAdvancedProgram`, `validatePlacementRows`,
  `placementScheduleRows`. `program_layers` hold tower label, type (incl.
  `quota_share`), attachment, limit and basis; `layer_participations` hold each
  insurer's written line, signed line, premium and lead flag. A simple layer is
  one participation signed at 100%; `saveTowerLayer` keeps that invariant and
  refuses to edit a multi-insurer layer.
- **Line groups** are `gl`, `auto` and `property`; `layersFor(inputs, group)`
  selects a group's layers. TIV comes from the linked policy's
  `insurable_value`.
- **Coverage across towers adds shares; within a tower gaps and overlaps are
  findings.** Bases are added as if they responded to the same loss and the
  profile says so when they differ; never silently.
- **Deductible schedules** (`policy_deductibles`): the row with `is_default`
  mirrors `policies.deductible`. Every policy write calls
  `syncDefaultDeductible` (`src/server/deductibles/sync.ts`); editing the
  default row writes the amount back to the policy; the default row cannot be
  deleted (clear the policy's deductible instead) and must stay a flat amount.
  Logic is in `src/lib/domain/deductibles.ts` (`deductibleForClaim`,
  `matchRule`, `validateScheduleRows`).
- **Claims carry `peril`** (default "All other perils") and an optional
  `value_at_risk`. The strategy replay (`replayYear` with a `ReplayDeductible`)
  uses the rule matching the claim's peril and lets the option replace only the
  default amount; waiting-period and unknown-value claims are excluded with a
  flag, never counted as zero.
- **Marketing and Strategy default policy**: fewest days to expiry with no
  outcome yet (ties: the policy with submissions / options), remembered in the
  URL.
- The v1.3 demo cases (Pacific Northwest Terminals two-tower placement and
  schedule, the other four accounts, retention unchanged) are checked in
  `src/server/db/seed/__tests__/demoBookAdvanced.test.ts`.

## Commands

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` ·
`npm test` · `npm run db:generate` · `npm run db:migrate` · `npm run db:seed`
(`SEED_AS_OF=YYYY-MM-DD` fixes the as-of date; `SEED_WORKSPACE_SLUG=…` seeds an
existing empty workspace). Browser smoke tests: `scripts/e2e-renewals.cjs`, `scripts/e2e-dashboard.cjs`,
`scripts/e2e-lossruns.cjs`, `scripts/e2e-program.cjs`, `scripts/e2e-marketing.cjs`,
`scripts/e2e-strategy.cjs`, `scripts/e2e-advanced.cjs`
(see its header; Playwright is not a dependency).
