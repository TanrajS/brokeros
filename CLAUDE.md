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

1. **No login, no payments, no AI features, no analytics scripts.** The only
   permitted environment variables are `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`
   (Vercel Blob, injected by the Vercel Blob integration; optional locally) and
   `CRON_SECRET` (guards the nightly demo reset), all read in
   `src/server/env.ts` and nowhere else. Vercel Blob is the one external
   service. `.env.example` is committed; `.env*` is git-ignored. If
   `DATABASE_URL` is missing or the database is unreachable, the app renders
   `/setup` instead of crashing; if the Blob token is missing, the Documents tab
   and certificate generation say so and switch off, nothing else breaks.
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
| Demo book | `src/server/db/seed/demoBookData.ts` (pure, takes as-of; `buildDemoBook` = the ten accounts every test pins), `demoDocuments.tsx` (renders the seed PDFs and uploads them once under `seed/`) and `demoBook.ts` (writes it); `demoBookDashboard.ts` / `demoBookLossRuns.ts` / `demoBookProgram.ts` / `demoBookStrategy.ts` map it for tests |
| Documents and Blob | `src/server/documents/blob.ts` (the only module that imports `@vercel/blob`), `src/server/documents/{queries,actions}.ts`, download route `src/app/w/[slug]/documents/[documentId]/route.ts`; PDFs in `src/server/certificates/pdf.tsx` and `src/server/program/pdf.tsx`, both loading `@react-pdf/renderer` through `src/server/pdf/reactPdf.ts`; their content comes from pure `certificateContent` and `programSummaryContent` (`src/lib/domain/programSummary.ts`) |
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
  Later versions add `claims`, `quote_options`, `program_layers`,
  `layer_participations`, `policy_deductibles` and (v1.4) `documents` through
  new migrations using the same column helpers. v1.5 renamed
  `layer_participations.premium` to `premium_100` (`0013_premium_100`, written
  with `drizzle-kit generate --custom`; the custom snapshot copies the previous
  schema, so the column was renamed in `0013_snapshot.json` by hand and
  `drizzle-kit generate` confirmed "No schema changes"). v1.4 dropped
  `contract_requirements`, `certificates`, `submissions` and `quotes`
  (`0011_removals`, after copying quote-derived option premiums into
  `quote_options.premium` as manual options) and removed Workers Compensation
  (`0010_remove_workers_compensation`, custom). `tower_layers` (v1) was converted into
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
- **Names are unique (v1.5.1).** `accounts_workspace_name_uq` on
  `(workspace_id, lower(trim(name)))` and `policies_account_number_uq` on
  `(account_id, lower(trim(policy_number)))` (blanks free). `nameConflict` in
  `src/lib/domain/book.ts` is the one rule; the account and policy actions check
  it before writing and map a unique violation to the same field error, and the
  forms call `checkAccountName` / `checkPolicyNumber` on blur. A migration that
  adds such an index must rename existing duplicates first (" (2)", " (3)") and
  report them (`0015`).
- **Demo accounts carry `accounts.is_seed = true`** (v1.5.1); the seed writer
  sets it and `0015` back-filled it for the known fictional names without user
  documents. `pruneRetiredDemoAccounts` (`src/server/workspace/prune.ts`,
  importable from the CLI, so no `server-only`) deletes only `is_seed` rows
  whose name matches `isRetiredDemoAccountName` (Ashgrove, Kestrel, Prairie,
  Bluewater, Copperfield, Maple, Tidewater; whole first word). The five other
  old names (Greyhawk, Lantern Hill, Northfield, Pinecrest, Summit Row) are
  deliberately not pruned yet.
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
- **Flags live on the rows (v1.5).** There is no data quality panel: every
  `ClaimFlag` is a badge on its claim row with `CLAIM_FLAG_REASONS[f]` on hover,
  and the claims table has a "Flagged only" checkbox. The policy-year table is
  split by `groupPolicyYears(rows, asOf, policyStatus)` into Active and in
  progress (in force, or no outcome with an open status; soonest expiry first)
  and Expired (the rest; most recent first); three rows per group, "Show N more"
  remembered in the URL as `active=all` / `expired=all` (`LossRunQuery`), counts
  in the group headers. `loadLossRunInputs` returns `policyStatus` for it.
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
  `coinsurancePayment`, `analyzeParticipation` and the v1.3 placement functions.
  `src/server/program/queries.ts` maps rows (`loadProgramLayers`, `layersFor`);
  the Program page does the computing. Contract requirements and the v0.5
  certificates table were removed in v1.4.
- **Adequacy never says adequate.** Labels are the arithmetic; the decision is
  the user's.
- **Tower diagram:** blocks are `flex: span 1 0%` so one markup works as a
  column (md+) and a row (mobile); gaps hatched red, overlaps amber; the table
  beside carries every figure.
- **Participants and sub-limits** cascade with their policy. The policy's own
  `carrier` is the lead insurer; participants are the full schedule.
- The demo program cases (Harbourline tower, Cedar gap and adequacy) are
  checked in `src/server/db/seed/__tests__/demoBookProgram.test.ts`.

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
- **Retained-loss arithmetic:** retained = Σ min(adjusted incurred, deductible),
  then min(·, cap); adjustments (trend, development) apply per claim before the
  deductible. The current year counts as a full year when included and is
  labelled incomplete. The domain functions keep their names
  (`selectReplayYears`, `replayYear`, `ReplaySettings`) but no user-facing
  string, README sentence or report line says "replay" or "running year" (v1.5):
  the basis line is "Basis: N policy years (PYa to PYb; current year included as
  incomplete), raw incurred, as of 16 Nov 2026.", the table is "Retained losses
  by year at each deductible" and the method sentence is "Each option applies its
  deductible to the account's actual claims, year by year."
- **TCOR premiums are in-force current terms** (the v0.3 rule) with the option's
  premium in place of the analysed line; other lines without loss runs count as
  zero and are flagged, never silently.
- Options are entered by hand (`quote_options`, "manual") or estimated by the
  v1.4 findings engine; the report says which is which and never calls either a
  quote.
- The demo strategy cases (Harbourline, Cedar Ridge) are checked in
  `src/server/db/seed/__tests__/demoBookStrategy.test.ts`.

## Placement rules (v1.3)

- **Subscription placements live in `src/lib/domain/program.ts`**:
  `layerSummary`, `coverageProfile`, `programTotals`, `signDown`,
  `towerInputsFrom` (feeds a tower to `analyzeTower` for the v0.5 gap and
  overlap checks), `isAdvancedProgram`, `validatePlacementRows`,
  `placementScheduleRows`. `program_layers` hold tower label, type (incl.
  `quota_share`), attachment and limit (per occurrence is assumed and stated
  once on the Program tab, in the heading's info tooltip; the v1.3 `basis`
  column was dropped in v1.4); `layer_participations` hold each insurer's
  written line, signed line, **100% premium** (`premium_100`) and lead flag. A
  simple layer is one participation signed at 100%; `saveTowerLayer` keeps that
  invariant and refuses to edit a multi-insurer layer.
- **Premiums are quoted at 100% (v1.5).** `premium_100` is what the insurer
  quoted as if it wrote the whole layer; `actualPremium(premium100, signed)` =
  premium_100 × signed line ÷ 100 is computed in `layerSummary` and never stored.
  Layer premium = Σ actual premiums; `premium100Equivalent` = layer premium ÷
  placed share (the layer total row labels it "100% equivalent"); rate on line
  per insurer = premium_100 ÷ layer limit = actual ÷ exposed limit, and the math
  line shows both forms. Program premium, rate per $100 of TIV, blended rate on
  line, the report and the findings engine use actual premiums. The CSV column is
  `premium_100`; the export starts with `PLACEMENT_CSV_NOTE` and the import
  parses with `comments: "#"`. The seed states every participation at 100% so the
  v1.3 actual figures (310,000 / 264,000 / 181,000; 755,000) are unchanged.
- **Layer block widths (v1.5):** segments share the block by `shareOfPlaced` =
  signed line ÷ placed share, not by signed line of 100%; the block carries a
  small "N% placed" label top-left. Under- or over-placement shows only in the
  Placement column, the segment table and the layer total row.
- **Program PDF (v1.5):** `exportProgramPdf` (in `src/server/program/actions.ts`)
  renders `programSummaryContent` with `src/server/program/pdf.tsx` (landscape
  Letter, every segment labelled with an insurer key), uploads it with
  `uploadDocumentBlob` and files a `policy_document` titled "Program summary —
  <line group> — <as-of date>"; the button opens the new tab on the click so
  pop-up blockers allow it. `programTivFor` in `src/server/program/queries.ts`
  is the one TIV rule shared by the tab and the export.
- **Line groups** are `gl`, `auto` and `property`; `layersFor(inputs, group)`
  selects a group's layers. TIV comes from the linked policy's
  `insurable_value`.
- **Coverage across towers adds shares; within a tower gaps and overlaps are
  findings.** The segment table is the only coverage view (the strip was
  removed); Placed % is red whenever it is not 100% and the unplaced dollars are
  shown beside it.
- **Coverage schedules** (`policy_coverage_parts`, v1.5.1; was
  `policy_deductibles`, renamed with its data by `0017_coverage_parts`): the row
  with `is_default` mirrors `policies.deductible`, `occurrence_limit` and
  `aggregate_limit` and exists while any of the three is set. Every policy write
  calls `syncDefaultCoveragePart` (`src/server/deductibles/sync.ts`); editing the
  default row writes all three back to the policy; the default row cannot be
  deleted and its deductible must stay a flat amount. Other rows are coverage
  parts with their own deductible rule and optional sublimits. Logic is in
  `src/lib/domain/deductibles.ts` (`deductibleForClaim`, `matchRule`,
  `validateScheduleRows`, `checkPartLimits`: aggregate < occurrence is an error,
  a part limit above the headline is a warning only, `retainedAboveLimit`,
  `describePartLimits`). The `CoveragePartsChip` shows "N coverage parts" with
  the parts and limits on hover; the certificate lists parts with their own
  limits as "Sublimits".
- **Retained above limit (v1.5.1):** `replayYear` takes
  `ReplayDeductible.defaultOccurrenceLimit` (the policy's headline limit, passed
  by `buildStrategyView` as `ReplaySettings.defaultOccurrenceLimit`) and each
  part's `occurrenceLimit`; `retainedAboveLimit` = Σ max(0, incurred − that
  limit) is reported beside `retained`, never inside it, so the hand-verified
  deductible figures stay put. `transferred` = incurred − retained − above limit;
  `expectedTotalCost` = premium + average retained + `averageRetainedAboveLimit`;
  `RetentionAnalysis.anyAboveLimit` switches the column and the note on. No
  seeded claim exceeds a part or headline limit (`demoBookStrategy.test.ts`).
- **Claims carry `peril`** (default "All other perils") and an optional
  `value_at_risk`. The strategy replay (`replayYear` with a `ReplayDeductible`)
  uses the rule matching the claim's peril and lets the option replace only the
  default amount; waiting-period and unknown-value claims are excluded with a
  flag, never counted as zero.
- **Strategy default policy**: fewest days to expiry with no outcome yet (ties:
  the policy with options), remembered in the URL.
- The v1.3/v1.4 demo cases (Pacific Northwest Terminals two-tower placement and
  schedule, the ten-account retention set, boundary policies) are checked in
  `src/server/db/seed/__tests__/demoBookAdvanced.test.ts`.

## Documents, certificates and findings rules (v1.4)

- **Documents** (`documents` table) belong to an account, optionally a policy;
  `doc_type` is proposal | submission | certificate | policy_document. Only
  proposals carry `status`; only submissions carry `markets`. File rules
  (`MAX_DOCUMENT_BYTES`, `ALLOWED_DOCUMENT_TYPES`, `checkDocumentFile`), the
  policy-year label and `certificateReissueNeeded` live in
  `src/lib/domain/documents.ts`. The upload action re-runs the same checks and
  stores nothing on a field error.
- **Blob is private.** `uploadDocumentBlob` always uses `access: "private"` and
  a random suffix; files are read only through the download route, which
  requires the `brokeros_workspace` cookie to match the workspace. Deleting a
  document deletes its blob unless `is_seed` is true (seed files are shared
  under the fixed `seed/<key>.pdf` pathname; `ensureSeedDocuments` heads before
  it puts, so they are uploaded once). Anything that deletes accounts in bulk
  (delete account, reset workspace, replace with the demo book, nightly reset)
  calls `deleteUserBlobs` (`src/server/documents/cleanup.ts`) first, because
  document rows cascade but blobs do not. `blobReady()` gates every Blob feature.
- **Certificates are documents.** `generateCertificate` renders
  `certificateContent` (pure, `src/lib/domain/certificates.ts`) with
  `@react-pdf/renderer`, uploads the PDF and inserts a `certificate` row linked
  to the policy. The issue date is the as-of date. Reissue needed = the policy
  has a successor or expiry ≤ as-of; derived on read, never stored. The PDF is
  Broker OS's own layout, never an industry form; the preview on screen uses the
  same `certificateContent`.
- **Findings are pure** (`src/lib/domain/strategy.ts`): `bandAnalysis`,
  `priceFindings`, `limitAdequacy`, `automaticOptions`, `estimatePremium`,
  `severityPercentile`, `modifiers`, `strategyFindings`. `buildStrategyView`
  is the one place that assembles them. Wording: "candidate", "for discussion";
  "recommended" only as "recommended for discussion"; the tab and report always
  carry "Estimated premiums are derived from your loss history and this ratio;
  they are not quotes." Tolerances and PLR live on `accounts`
  (`tolerance_occurrence`, `tolerance_year`, `permissible_loss_ratio`, null =
  defaults 0.5% / 1% of revenue / 0.65); accepted finding ids in
  `accounts.accepted_findings`.
- **Partial-line retention (v1.5):** in `bandAnalysis`, for a working band whose
  limit exceeds the per-occurrence tolerance, client line = the largest whole %
  with line × band limit ≤ per-occurrence tolerance and line × worst-year in-band
  ≤ annual tolerance (minimum 1%); saving = line × `premium100Equivalent`,
  expected retained = line × average in-band, worst-year retained = line ×
  worst-year in-band, net = saving − expected retained; `partial_line` fires when
  net > 0 and adds "This line would also reduce the unplaced share of the segment
  from X% to Y%." for a short segment (via `coverageProfile`, so `tiv` flows into
  `BandAnalysisInput`). Never for a catastrophe band. `FindingsList` renders it
  beside the `raise_deductible` finding of the same band. Pinned in
  `findings.test.ts` (Harbourline 142,000: 12%, 17,040, 5,088, 13,800, 11,952).
- **Band rules:** the primary responds from the deductible (attachment =
  deductible, limit = limit − deductible); in-band loss per year = Σ min(max(
  incurred − attachment, 0), limit); working = any in-band loss or frequency
  > 0.2/yr (`WORKING_BAND_FREQUENCY`); a catastrophe band never yields a
  retention candidate. Estimated premium = current − increase in average
  retained ÷ PLR, floored at 25% (`PREMIUM_FLOOR_SHARE`) and flagged.
  Percentiles are nearest rank, rounded to $5,000 or $25,000 above $100,000.
  `src/lib/domain/__tests__/findings.test.ts` pins the Harbourline, inverted
  pricing and Maplewood figures; never edit an expected value to make it pass.
- **Nightly reset.** `/api/cron/reset-demo` (Bearer `CRON_SECRET`, scheduled
  in `vercel.json`) calls `resetDemoWorkspace` for workspaces with
  `reset_nightly`; it re-uses the `seed/` blobs and never re-uploads.

## Copy and wording rules (v1.5)

- **No helper sentences.** Pages show data, units in column headers, the as-of
  date in the header, Show the math, validation messages, empty states and any
  sentence stating an assumption the user can change (basis in use, tolerances,
  permissible loss ratio). Anything else a new user might need goes in an
  `<InfoTip>` (`src/components/InfoTip.tsx`) on the section heading, never in a
  paragraph under it. The per-occurrence basis is stated once, in the Program
  heading's tooltip.
- **Glossary (use these words, consistently):** expiring policy (the term coming
  up for renewal), renewal, successor policy (the term created by a renewed
  outcome; never "renewal policy"), bound, signed line, written line, 100%
  premium, actual premium, placed, short (in labels and tiles: "$X short", "Short
  ($)"; "Under-placed" stays only as the status word), exposed limit, rate on
  line, band, deductible, retention, tolerance, basis, coverage part (one row of
  a policy's coverage schedule: a peril or coverage part with its own deductible
  rule and, optionally, its own limits; the default part is all other perils),
  sublimit (a coverage part's own occurrence or aggregate limit, below or, with a
  warning, above the policy's headline limit), retained above limit (the part of
  a loss above its coverage part's occurrence limit, borne by the client on top
  of the deductible and kept separate from the deductible retention). Never "replay",
  "replaying", "running year" (say "current year"), "unplaced" in a label (the
  spec's own partial-line sentence keeps "unplaced share"), "VAR" (say "value at
  risk") or "occ / agg".
- **Form:** sentence case everywhere ("Loss runs", "Show the math"); no
  abbreviations a client would not know except TIV, ROL and TCOR (spelled out
  the first time: "Total cost of risk (TCOR)"); dates as 16 Nov 2026
  (`formatDate`; the domain uses a local `longDate` for sentences and keeps ISO
  where a date is data); "as of" rather than "as-of" in prose (the Settings field
  and code identifiers keep `as-of`/`asOf`); buttons are verbs (Generate report,
  Export PDF, Add insurer, Save option, Save tolerances).

## Commands

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` ·
`npm test` · `npm run db:generate` · `npm run db:migrate` · `npm run db:seed` ·
`npm run db:prune-demo` (deletes `is_seed` accounts whose name starts with a
retired demo prefix, every workspace, and prints the counts)
(`SEED_AS_OF=YYYY-MM-DD` fixes the as-of date; `SEED_WORKSPACE_SLUG=…` seeds an
existing empty workspace; `SEED_NIGHTLY_RESET=1` flags it for the cron reset;
with `BLOB_READ_WRITE_TOKEN` the seed PDFs are uploaded once under `seed/`). Browser smoke tests: `scripts/e2e-renewals.cjs`, `scripts/e2e-dashboard.cjs`,
`scripts/e2e-lossruns.cjs`, `scripts/e2e-program.cjs`,
`scripts/e2e-strategy.cjs`, `scripts/e2e-advanced.cjs`, `scripts/e2e-documents.cjs`
(see its header; Playwright is not a dependency).
