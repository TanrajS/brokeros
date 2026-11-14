# Changelog

## v1.2 — Strategy (2026-11-14)

Strategy: retention optimizer, total cost of risk, renewal strategy report.

- **Strategy tab** in Placement, per policy in renewal.
- **Retention options** (new `quote_options` table): label, carrier,
  deductible, optional aggregate cap, premium and an optional link to the quote
  it was imported from. Add by hand or **Import from quotes**.
- **Retention optimizer** (`analyzeRetentionOptions`): replays each option
  against the account's claims by policy year (retained = Σ min(incurred,
  deductible), then the cap; transferred = the rest); average and worst-year
  retained; against the lowest-deductible base: premium saving, additional
  expected retained, expected total cost, net expected saving, break-even
  retained losses, the worst-historical-year sentence and maximum annual
  exposure. Settings: number of years (default five), include the running year
  (default yes, flagged incomplete), trend and development per claim (default
  off). Comparison table with units on every row, a chart of expected total
  cost with the worst-year total as a second series, an expandable per-year
  replay, and a neutral Considerations panel. No option is marked recommended.
- **Total cost of risk** (`totalCostOfRisk`): premiums with the option's
  premium substituted, expected retained (option average plus other in-force
  lines below their deductibles, flagged when a line has no loss runs), broker
  fees, risk control spend and internal claims administration (new account
  columns, default zero). Dollars, percent of revenue and per $1,000 of revenue,
  per option side by side, with a stacked breakdown chart and table.
- **Renewal strategy report** at `…/strategy/report`: profile and exposures,
  program tower, five-year loss history with the basis stated, contract
  requirement status, market results, retention options with per-year replay,
  TCOR by option, considerations, and **Assumptions and limitations** generated
  from the settings used. Prints to PDF through the browser; **Export inputs
  (JSON)** at `…/strategy/report/export` returns every input for audit.
- **Demo book**: Harbourline's GL renewal carries three Pacific Crest options
  ($10,000 / $142,000 linked to the Pacific Crest quote, $25,000 / $124,000,
  $50,000 / $110,000), broker fees $15,000 and risk control $10,000. Cedar
  Ridge's GL carries $5,000 / $108,000, $10,000 / $103,500 and $25,000 /
  $97,000 with Northgate.
- **Migration** `0005_strategy`: `quote_options`; `accounts.broker_fees`,
  `risk_control_spend`, `claims_admin_cost`.
- Workspace JSON export now includes submissions, quotes and quote options.

## v1.1 — Marketing (2026-11-13)

Marketing: submission package, carriers approached, quotes, like-for-like comparison, market log.

- **Marketing tab** in Placement, per policy in renewal.
- **Submission package**: the policy's readiness checklist (done and
  outstanding documents) and a one-page, printable **submission summary**:
  account profile, operations, exposure, expiring terms, the five-year loss
  summary and the target terms. Printing hides the app chrome; nothing is sent.
- **Carriers approached** (new `submissions` table): planned, submitted, quoted,
  declined (with reason), no response, bound. Transitions are enforced by
  `checkTransition`; days to respond (or days waiting) is derived.
- **Quotes** (new `quotes` table): premium, limits, deductible, endorsements,
  commission rate, exposure rated on, subjectivities, valid-until (expired quotes
  flagged and not bindable) and incumbent flag; several options per carrier.
- **Bind**: one per policy. It opens the v0.2 Renewed outcome prefilled with
  the quote's terms, and the new policy takes the quote's endorsements. Unbind
  is allowed until the outcome is recorded.
- **Like-for-like comparison** (`compareQuotes`): expiring terms first, one
  column per quote; premium change, rate on exposure and its change, premium per
  $1M, commission beside client cost, and a term-by-term comparison with every
  mismatch listed ("5 of 7 terms match"). The target switches between the
  expiring terms and any of the account's contract requirements; the summary
  row sorts by premium, change, commission or terms matched. **Normalise**
  drops quotes whose limits or deductible differ from the target and says which
  and why.
- **Market log** (`marketLog`): per carrier submissions, quotes, binds, declines
  by reason, hit ratio, bind ratio and median days to respond, with a flag for
  three or more submissions and no quotes. On a new **Market log** page (from
  the Placement picker) and as a Dashboard card that follows the Dashboard's
  lookback and producer filters.
- **Demo book**: Harbourline's GL renewal has five carriers. The incumbent
  Dominion Shield quoted $158,000; Pacific Crest $142,000 on identical terms;
  Ironwood $128,000 with a $25,000 deductible and no waiver; Maplewood declined
  (class of business); Tidewater has not responded after 14 days. Earlier
  renewals for Kestrel, Cedar Ridge and Northfield add a year of market history,
  in which Maplewood is flagged (four submissions, no quotes).
- **Migration** `0004_marketing`: `submissions` (with `responded_on`) and
  `quotes` (with `exposure_amount` and `is_bound`).

## v1 — Program (2026-11-13)

Program: tower analysis, contract requirements checker, certificates, property adequacy. Additional updates to support large policies.

- **Program tab** in Placement, per account, with a line-group switch (General
  Liability or Commercial Auto, each with Umbrella/Excess).
- **Tower** (new `tower_layers` table): layers with attachment, limit, premium,
  carrier and an optional linked policy. `analyzeTower` gives exhaustion, rate
  on line, premium per $1M and the rate relative to the primary, and finds
  gaps, overlaps, a primary attaching above zero and rate inversions. The tower
  is drawn to scale (vertical on wide screens, horizontal on phones) with gaps
  hatched red and overlaps amber, beside a table. Editing a layer previews the
  whole tower's findings as you type.
- **Contract requirements checker** (new `contract_requirements` table):
  required limits and endorsements per coverage against the account's current
  policies and tower, showing provided limits, the dollar gap, endorsements
  present and missing, and Meets / Shortfall / Missing coverage. A toggle counts
  umbrella and excess limits toward the per-occurrence requirement, explained on
  screen as a contract-specific question.
- **Certificates of insurance** (new `certificates` table) with a derived
  status: Requested, Issued, Expired or Reissue needed. Issue and Reissue stamp
  the as-of date. The Account page lists them; the Renewals page shows a
  **Certificates due** panel of every certificate needing reissue.
- **Property adequacy panel** on Property policies: insurable value,
  coinsurance clause, limit carried, hypothetical loss and deductible, with the
  payment, what the client absorbs, the penalty share and the additional limit
  needed. Property policies gained optional insurable value and coinsurance
  fields that seed the panel.
- **Larger placements:** a policy can list the insurers sharing it (new
  `policy_participants` table) with role, signed line and premium; the app
  totals the lines and premiums and flags short or over-placement. Policy rows
  show "+N insurers", and a tower layer linked to a policy shows its insurers.
  Policies can also carry **sub-limits with their own deductibles** (new
  `policy_sublimits` table), with the policy limit and deductible as defaults.
- **Demo book:** Harbourline has the three-layer tower, the Westbay Grocers
  supply agreement and two certificates (one flips to Reissue needed once its
  GL renews). Cedar Ridge has a two-layer tower with a $1M gap, a construction
  contract whose $5M umbrella requirement it meets, and a Property policy with a
  $1,000,000 building insured for $600,000 at 80% coinsurance. Kestrel's
  property policy is shared by three insurers (50/30/20) with four sub-limits.
- **Migration** `0003_program`: the five tables above plus
  `policies.insurable_value` and `policies.coinsurance_percent`.
- Export JSON includes the new tables. Undo outcome keeps working: a successor's
  insurers and sub-limits are deleted with it.

## v0.4 — Loss runs (2026-11-12)

Loss runs: claims, CSV import, policy-year summary, trend and development, large loss and open claims.

- **Placement** opens with an account picker, then tabs: Loss Runs (now),
  Program (v0.5), Marketing (v0.6) and Strategy (v0.7), with placeholders.
- **Claims** (new `claims` table, migration `0002_claims`): line, claim number,
  loss and report dates, description, paid, reserved, status and an optional
  linked policy. Incurred and the policy year are derived, never stored. Add,
  edit and delete with validation. Closed claims with a reserve need
  confirmation, and duplicate claim numbers are warned about and flagged.
- **CSV import** with a downloadable template. Columns may be in any order and
  are parsed in the browser with papaparse. A preview marks each row valid or
  invalid with the reason. Only valid rows are imported, in one transaction,
  with a result such as "Imported 23 of 25 rows; 2 skipped" and the skipped rows
  listed.
- **Policy-year summary** per account and line: the current year plus up to five
  earlier ones, with claims, open claims, paid, reserved, incurred, earned
  premium (earned to date for the running year), loss ratio, frequency (basis
  labelled) and severity. Adds five-year total and average rows, a chart of
  incurred with loss ratio on a second axis, and the table.
- **Trend and development** (optional, off by default, kept in the URL): raw and
  adjusted figures side by side, the active basis labelled, and the trend
  exponent, age and factor shown per year.
- **Large losses** with a threshold and cap (capped loss ratio beside the full
  one), **open claims** by reserve, and a **data quality** panel.
- **Demo book:** Harbourline Foods and Cedar Ridge Mechanical each have five GL
  policy years (PY2022–PY2026) chained by previous-policy links, with 12 and 3
  claims. A seed test checks Harbourline PY2023 (incurred $135,000, loss ratio
  0.9643, severity $67,500, frequency 0.08 per $1M) and the five-year totals (12
  claims, $305,000). The Bluewater umbrella prior term was removed and the
  Kestrel and Greyhawk prior premiums lowered, so the Dashboard still shows
  87.5% / 80.0% retention.
- **Other changes:** Undo outcome now refuses when the renewal policy has claims.
  Deleting an account says how many claims go with it. Export JSON includes
  claims.

## v0.3 — Dashboard (2026-11-12)

Dashboard: book, retention, expiring premium, revenue forecast, concentration.

- **Filters in the URL:** producer, lookback window (trailing 6, 12 or 24 months)
  and forward window (next 3, 6 or 12 months). The exact start and end dates of
  each window are printed on the page.
- **Book tiles** for the book in force at the as-of date: in-force premium,
  policy count, active accounts, booked commission and the premium-weighted
  average commission rate.
- **Retention:** count retention, premium retention and the renewed premium
  ratio, each with numerator and denominator shown. Expired policies with no
  outcome count as lost and are flagged. The page says how many policies with
  an outcome were left out because they have not expired. A lost business table
  lists account, line, carrier, expiring premium, reason and competing premium.
- **Expiring premium:** a bar chart by month for open policies, with an
  accessible table beneath. Clicking a bar or a month opens Renewals filtered to
  that month (new `month` and `open` filters). Also a table of the top 10
  expiring policies with days to expiry and readiness.
- **Revenue forecast:** Low, Base and High commission from editable assumptions
  (retention defaults to premium retention or 85%, rate change to 0%), kept in
  the URL, with every policy's contribution in Show the math.
- **Concentration:** share of in-force premium by carrier, line and top 5
  accounts, with a neutral note when a carrier is above 35% or an account above
  15%.
- **Producer view:** every figure recomputes for the selected producer's
  accounts, with "Showing N of M accounts (producer: name)."
- Every figure has Show the math. Missing values show an em dash with a
  tooltip, never NaN.
- **Demo book:** the trailing 12 months now hold exactly 10 resolved renewals (8
  renewed, 1 lost, 1 non-renewed; $1,240,000 expiring, $1,085,000 renewed), so
  premium retention shows 87.5% and count retention 80.0%. Dominion Shield
  holds 39.7% of in-force premium. To get there, five accounts gained a
  prior-year term or a historical loss. Maple & Mast's two policies expiring
  today were renewed and Northfield's property was non-renewed. As a result the
  Renewals "Expired — action required" column is empty in the demo.
- All metric logic is in `src/lib/domain/dashboard.ts` with hand-checked tests.
  A seed test runs the demo book through the retention function and expects
  0.875 and 0.80.

## v0.2 — Renewals (2026-11-12)

Renewals: stages, readiness checklist, tasks, activities, outcomes, rate change math.

- **Renewal stages** from `getRenewalStage(daysToExpiry, renewalStatus)`:
  Not yet due, 120-day Strategy, 90-day Marketing, 60-day Quoting, 30-day
  Binding, Expired, and Closed. A Stage rules panel on the Renewals page shows
  the exact boundaries.
- **Renewals page** with a board (one column per stage) and a list sortable by
  days to expiry. Cards show account, line, carrier, expiring premium, days to
  expiry, readiness and overdue tasks. Filters for producer, account manager,
  line, carrier and stage live in the URL, so a filtered view can be shared. A
  summary strip shows count and expiring premium per stage plus overdue tasks.
- **Policy page** (new): term and key facts, renewal outcome, rate-change
  comparison with the prior term or the renewal, readiness checklist and tasks.
- **Readiness checklist**: generated the first time a policy is opened, with
  four common items plus a line-specific item. Users can tick items and add or
  remove custom ones. "Ready to market" shows only at 100%.
- **Tasks** on accounts and policies, with overdue meaning due before the as-of
  date and not done. **Generate standard renewal tasks** creates Strategy
  meeting, Submit to market, Compare quotes and Bind and issue, due 120, 90, 60
  and 30 days before expiry. It skips past-due and duplicate tasks and reports
  the counts.
- **Activity log** on the Account page, newest first: user notes, plus automatic
  entries for stage changes, checklists reaching 100%, and outcomes recorded or
  undone.
- **Renewal outcomes**: Renewed (creates the successor policy in one
  transaction), Lost (reason and competing premium) and Non-renewed by carrier
  (reason). Outcomes are immutable except through **Undo outcome**, which
  deletes the successor, restores the prior status and is logged. Undo is
  refused if the successor already has its own outcome.
- **Rate change vs premium change** via `getRateMetrics`, with a plain-English
  sentence, a "Show the math" list to four decimals, and an identity check that
  warns if (1 + premium change) ≠ (1 + rate change) × (1 + exposure change).
- **Demo book**: about a third of policies have a partly completed checklist
  and one is ready to market. Six policies have eight overdue tasks between
  them. Three outcomes are recorded: two renewals with successors and one loss
  to price. Cedar Ridge Mechanical's GL ($108,000 on $23,000,000) now succeeds a
  prior-year $100,000 on $20,000,000 term.
- **Migration** `0001_renewals`: new tables `checklist_items`, `tasks`,
  `activities` and `renewal_outcomes`, plus `policies.last_logged_stage`.
- **Changes to v0.1 behaviour**: the Book counts only current terms, skipping
  policies that have a successor, so premium is not double-counted. The policy
  form offers only Not started and In progress; closed statuses come from
  outcomes. Account policy rows link to the new policy page and show a Stage
  column. Table header cells now carry `scope="col"`. Export JSON includes the
  four new tables.

## v0.1 — Foundation (2026-11-12)

Workspaces, accounts, contacts, policies, demo book, settings.

- **Workspaces replace accounts.** First visit creates a workspace with a random
  10-character slug, remembers it in an httpOnly cookie and redirects to
  `/w/[slug]`. Opening a shared link adopts that workspace.
- **App shell** with workspace name, as-of date (linked to Settings) and a
  Share-link button; navigation for Book, Renewals (v0.2), Dashboard (v0.3),
  Placement (v0.4) and Settings, with placeholders describing what is coming.
- **Book**: searchable, sortable, paginated account table with policy count,
  total annual premium, next expiry and days to expiry from the as-of date.
- **Account page** with edit/delete, contacts (add/edit/delete in a dialog) and
  a policies table showing limits as `$1M / $2M`, deductible, premium,
  commission (with the arithmetic in a tooltip), expiry and days to expiry.
- **Policy form** covering every policy field, currency inputs that accept
  `48,000` or `48000`, endorsement checkboxes, date pickers, a live commission
  preview and expiry-after-effective validation.
- **Settings**: workspace name, as-of date, Load demo book (confirms before
  replacing data), New workspace from demo, Export JSON, Export CSV (accounts,
  policies), Reset workspace with typed confirmation, and an About panel.
- **Domain functions** (`daysBetween`, `addDays`, `isExpiryAfterEffective`,
  `formatLimit`, `formatCompactDollars`, `parseCurrencyInput`,
  `commissionAmount`, `sumAmounts`, `nextExpiry`) returning `{ value, math }`,
  each with hand-checked Vitest tests.
- **Data model** in Drizzle with the first migration: workspaces, accounts,
  contacts, policies (cascading deletes, self-referencing previous policy).
- **Demo book**: 14 fictional accounts, 46 policies, relative to the as-of date,
  including the required 120/121/90/60/30/0-day and expired policies, Cedar
  Ridge Mechanical Ltd. and Harbourline Foods Inc.
- **Setup page** when `DATABASE_URL` is missing or the database is unreachable.
- CI workflow, `CLAUDE.md` house rules, `.env.example`.
