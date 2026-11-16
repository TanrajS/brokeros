# Broker OS

Broker OS is a renewal-first workspace for a commercial insurance brokerage. It
keeps a brokerage's book of business in one place (accounts, contacts and
policies) and counts every expiry from a workspace-wide **as-of date** rather
than the real clock, so a renewal pipeline, dashboard and placement workflow
can be built on top of numbers that are stable, explainable and testable.
Version 0.1 laid the foundation: shared workspaces, the book, account and policy
management, a fictional demo book and settings. Version 0.2 added the Renewals
module: a stage board, readiness checklists, tasks, an activity log, renewal
outcomes and rate-change math. Version 0.3 added the Dashboard: the book in
force, retention, expiring premium, a revenue forecast and concentration.
Version 0.4 opened Placement with Loss runs: claims, CSV import and a
policy-year summary with loss ratio, frequency and severity. Version 1 added the
Program tab: tower analysis, a contract requirements checker, certificates of
insurance and property adequacy, plus co-insurers and sub-limits on policies.
Version 1.1 added the Marketing tab: a submission package, carriers approached,
quotes, a like-for-like quote comparison and a workspace-wide market log.
Version 1.2 added the Strategy tab: retention options, a retention optimizer
that replays the account's own claims, total cost of risk per option and a
printable renewal strategy report with its assumptions generated from the
settings in use. Version 1.3 folds Placement into the account as tabs, models
subscription placements (several insurers per layer, several towers, a coverage
profile and sign-down), adds per-peril deductible schedules to policies and
claims, and seeds five more fictional accounts. Version 1.4 adds a Documents tab
per account backed by Vercel Blob, a Policy page that generates certificates of
insurance as PDFs, automatic strategy findings with estimated retention options,
and a focused ten-account demo book; it removes the Marketing tab, contract
requirements, layer bases, the coverage strip and Workers Compensation, so the
history above describes features that no longer exist. Version 1.5 is a polish
release: insurer premiums on a placement are quoted at 100% of the layer with
the actual premium derived from the signed line, layer blocks share their width
by placed total, the Program tab exports a PDF summary into Documents, the Loss
runs tab groups policy years into active and expired, the findings engine adds
partial-line retention candidates, and every page lost its helper copy in favour
of a consistent glossary.

## Local setup

1. **Create a Neon Postgres database** at <https://neon.tech> and copy its
   connection string (Connect → Connection string).
2. **Configure the environment** (three variables, read only in
   `src/server/env.ts`):

   ```bash
   cp .env.example .env.local
   # edit .env.local and paste the string into DATABASE_URL
   ```

   - `DATABASE_URL` is required.
   - `BLOB_READ_WRITE_TOKEN` (optional) switches on the Documents tab and
     certificate generation. On Vercel, add the Blob store through the Vercel
     Blob integration and the token is injected; locally, copy it from the
     store's settings. Without it the app runs and says documents are off.
   - `CRON_SECRET` (optional) guards `/api/cron/reset-demo`, which `vercel.json`
     schedules daily at 09:00 UTC to re-load the demo book into every workspace
     flagged `reset_nightly` (seed one with `SEED_NIGHTLY_RESET=1`).

3. **Install, migrate, seed (optional) and run:**

   ```bash
   npm install
   npm run db:migrate                     # creates the tables
   SEED_AS_OF=2026-11-12 npm run db:seed  # optional: a demo workspace; omit SEED_AS_OF to use today
   # the seed uploads its fictional PDFs once under seed/ when BLOB_READ_WRITE_TOKEN is set
   npm run dev
   ```

   Open <http://localhost:3000>. A workspace is created for you and its link is
   `/w/<slug>`. If `DATABASE_URL` is missing or unreachable you land on `/setup`
   with instructions instead of an error.

Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run db:generate` (new migration from schema changes).

## Things to know

- **Workspaces are shared by link.** There are no logins. Anyone who has
  `/w/<slug>` can view and edit that workspace. Use **Settings → New workspace
  from demo** to spin up a separate one.
- **All sample data is fictional.** Every company, carrier, person and email in
  the demo book is invented; any resemblance to a real insurer or business is
  coincidental.
- **The as-of date is the clock.** Change it in Settings and every
  days-to-expiry figure updates.
- Every calculation in `src/lib/domain/` returns `{ value, math }` so the UI can
  show its work (hover the commission column, for example).

## Business rules

These are the rules the app applies. The code that implements each one lives in
`src/lib/domain/renewals.ts`, with hand-checked tests.

### Renewal stages

Every policy has a stage, worked out from its days to expiry (counted from the
workspace as-of date, never today's clock) and its renewal status. The rules are
checked in this order and the first match wins:

1. If the renewal status is renewed, lost or non-renewed, the stage is
   **Closed**, however many days remain.
2. More than 120 days to expiry: **Not yet due**.
3. 91 to 120 days, inclusive: **120-day: Strategy**.
4. 61 to 90 days, inclusive: **90-day: Marketing**.
5. 31 to 60 days, inclusive: **60-day: Quoting**.
6. 1 to 30 days, inclusive: **30-day: Binding**.
7. 0 days (expires on the as-of date) or already expired:
   **Expired — action required**.

When a policy moves to a new stage (because the as-of date changed, the policy
was edited, or an outcome was recorded or undone), the move is written to the
account's activity log.

### Readiness, tasks and outcomes

- **Readiness** is the number of checklist items done divided by the total
  number of items, shown as "6 of 8 ready". A policy is **Ready to market**
  only when every item is done.
- A **task is overdue** when its due date is before the as-of date and it is not
  done. A task due on the as-of date is not overdue.
- **Standard renewal tasks** are due 120, 90, 60 and 30 days before expiry. Any
  whose due date is already before the as-of date is skipped, as is any already
  on the policy.
- **Renewed** creates a new policy that starts on the old expiry date and runs
  12 months, linked to the old one. The renewed, lost and non-renewed statuses
  can only be set by recording an outcome, and only **Undo outcome** can reverse
  one.

### Rate change versus premium change

Premium can rise simply because the insured got bigger. Rate change strips that
out by comparing premium per unit of exposure.

- **Rate** = premium ÷ exposure, expressed per $1,000 of exposure when the basis
  is revenue or payroll, per 100 square feet for square footage, and per unit
  for vehicles, employees or other.
- **Premium change** = renewal premium ÷ expiring premium − 1.
- **Exposure change** = renewal exposure ÷ expiring exposure − 1.
- **Rate change** = renewal rate ÷ expiring rate − 1.

The three always satisfy (1 + premium change) = (1 + rate change) × (1 +
exposure change). The app checks this to within 0.0001 and shows a warning if
it ever fails, because that would mean a bug. If either side's exposure is zero
or missing, or the two sides use different exposure bases, rate change shows
"— (exposure missing)" or the equivalent while premium change still shows.

Example: $100,000 on $20,000,000 of revenue renewing at $108,000 on
$23,000,000. Premium change is 108,000 ÷ 100,000 − 1 = 8.0%. Exposure change is
23,000,000 ÷ 20,000,000 − 1 = 15.0%. The rate goes from $5.00 to about $4.70 per
$1,000, so rate change is −6.1%. The app says: "Premium rose 8.0% while
exposure rose 15.0%, so the rate fell 6.1%."

### Dashboard windows and the book in force

- **Lookback window** (for retention): the trailing 6, 12 (default) or 24
  months ending on the as-of date. It runs from the day after (as-of date minus
  N months) to the as-of date, both days included. For an as-of date of 12 Nov
  2026 and 12 months, that is 13 Nov 2025 to 12 Nov 2026.
- **Forward window** (for expiring premium and the forecast): the next 3, 6 or
  12 (default) months. It runs from the day after the as-of date to (as-of date
  plus N months), both days included. A policy expiring on the as-of date has
  already expired, so it falls in the lookback window, never in both.
- **In force** at the as-of date means effective on or before the as-of date,
  expiring after it, and not lost or non-renewed.
- **Booked commission** is the sum of annual premium × commission rate over
  in-force policies. **Average commission rate** is booked commission ÷
  in-force premium (premium-weighted). **Active accounts** are accounts with at
  least one in-force policy.

### Retention

Retention looks at policies whose expiry date falls in the lookback window. All
of them have expired by the as-of date, so all of them are **resolved**:

- **Renewed**, **lost** or **non-renewed**, from the recorded outcome; or
- **Unresolved**: expired with no outcome. These count as lost and are flagged
  "Unresolved, treated as lost" in the lost business table.

Policies with an outcome that have not expired yet (for example, one lost early
but still running) are left out until they expire, and the Dashboard says how
many.

- **Count retention** = number renewed ÷ number resolved.
- **Premium retention** = expiring premium of renewed policies ÷ expiring
  premium of all resolved policies.
- **Renewed premium ratio** = premium of the renewal (successor) policies ÷
  expiring premium of all resolved policies. It can exceed 100% when rates or
  exposures rise. A renewed policy whose successor has been deleted counts $0
  and is noted.

In the demo book: 10 resolved (8 renewed, 1 lost, 1 non-renewed) with
$1,240,000 expiring, $1,085,000 of it renewed. Premium retention is
1,085,000 ÷ 1,240,000 = 87.5%; count retention is 8 ÷ 10 = 80.0%.

### Revenue forecast

The forecast covers **open** policies (no outcome yet, status not started or in
progress) expiring in the forward window. For each one:

> commission = expiring premium × assumed retention × (1 + assumed rate change) × the policy's own commission rate

and the forecast is the sum. The assumptions are editable and kept in the URL:

- **Assumed retention** defaults to the premium retention over the lookback
  window (for the selected producer), or 85% if there is none.
- **Assumed rate change** defaults to 0%.
- **Low** uses retention − 10 points and rate change − 5 points. **High** uses
  retention + 10 points and rate change + 5 points. Retention always stays
  between 0% and 100%; rate change never goes below −100%.

Example: $100,000 at 15% and $50,000 at 10%, retention 87.5%, rate change 0%:
100,000 × 0.875 × 0.15 = 13,125 and 50,000 × 0.875 × 0.10 = 4,375, so the base
forecast is $17,500. It is a projection from the assumptions, not a prediction.

### Concentration

Each carrier's, line's and account's share of in-force premium. A carrier
above 35% or an account above 15% is noted as a revenue risk to the brokerage,
not a verdict on the carrier or client.

### Loss runs

Claims are recorded per account with paid and reserved amounts. **Incurred =
paid + reserved**; it is always computed, never stored.

- **Policy-year assignment.** For a claim's line, the account's policy periods
  are its policies in that line plus any policy reached through
  `previous_policy_id` links. A claim belongs to the period whose term contains
  its date of loss: effective date ≤ date of loss < expiry date (a loss on the
  expiry date belongs to the next term). The period is labelled by its effective
  year, for example "PY2024: 2024-01-11 to 2025-01-11". If periods overlap, the
  claim's linked policy wins, otherwise the latest. A claim no period contains is
  kept but flagged "outside known policy periods" and left out of the year
  summaries until it is fixed.
- **Years shown.** The current policy year (the one containing the as-of date)
  and up to five before it. Totals and averages cover the five most recent years,
  the current one included. Periods that start after the as-of date are left out.
- **Earned premium** is the year's policy premium. For the running year it is
  pro-rated by days elapsed: premium × (days from effective date to as-of date ÷
  days in the term), labelled "earned to date".
- **Loss ratio** = incurred ÷ earned premium.
- **Frequency** = claims ÷ exposure units, where a unit is $1M of revenue or
  payroll, or 100 employees or vehicles. Other bases (square feet, other) show no
  frequency. The running year's exposure is pro-rated like its premium.
- **Severity** = incurred ÷ claim count, an em dash when there are no claims.
- On the **average** row, counts and dollars are the five-year totals ÷ the
  number of years; loss ratio, frequency and severity are the five-year
  aggregates (total ÷ total), not averages of the yearly ratios.
- **Trend** (optional, off by default): trended incurred = incurred × (1 + trend)
  ^ (prospective year − policy year). The prospective year is the renewal year,
  the year in which the current term expires.
- **Development** (optional, off by default): developed incurred = incurred ×
  the factor for the policy year's age. Age is whole months from the policy
  year's effective date to the as-of date, bucketed down to 12, 24, 36, 48 or
  60+; anything under 24 months uses the 12-month factor. Factors come from the
  carrier or an actuary and are entered, not calculated. With both on: incurred ×
  trend factor × development factor. Example: 100,000 at 5% trend over two years
  is 110,250; with a 1.15 factor, 126,787.50.
- **Large losses** are claims at or above the threshold (default $25,000), shown
  with their share of five-year incurred. **Capped incurred** = Σ min(incurred,
  cap), with the cap defaulting to the threshold; the capped loss ratio sits
  beside the full one.
- **Open claims** are sorted by reserve, with total open reserves and their share
  of the line's total incurred.
- **Validation and flags.** Paid and reserved must be non-negative. The report
  date must be on or after the loss date and not after the as-of date. A closed
  claim with a reserve is allowed only after confirming it (reopened files
  exist). Duplicate claim numbers on an account are allowed but flagged. Every
  flag (outside policy periods, duplicate number, closed with a reserve, reported
  before the loss, dated in the future) sits as a small badge on its claim row
  with the reason on hover; a **Flagged only** filter narrows the claims table to
  those rows (v1.5 removed the separate data quality panel).
- **Policy-year groups (v1.5).** The policy-year table is split into **Active
  and in progress** (in force at the as-of date, or in a renewal stage with no
  outcome yet; soonest expiry first) and **Expired** (expired or closed; most
  recent expiry first). Each group shows three rows, with a "Show N more" link
  that expands in place and is remembered in the URL (`active=all`,
  `expired=all`); group headers carry counts. Totals and averages still cover the
  five most recent years whatever is expanded.
- **CSV import** takes the template columns in any order. Every row is checked
  for missing or malformed dates (YYYY-MM-DD), future dates, an unknown line,
  missing or non-numeric amounts, an unknown status and duplicate numbers. Only
  valid rows are imported, all in one database transaction.

### Program: tower and adequacy

- **Tower layers** are the primary, umbrella and excess layers of a casualty
  program (General Liability or Commercial Auto, each with Umbrella/Excess).
  Layers are sorted by attachment. For each layer, **exhaustion** = attachment
  + limit; **rate on line** = premium ÷ limit (shown as a percent); **premium
  per $1M** = premium ÷ limit × 1,000,000; **relative rate** = this layer's rate
  on line ÷ the primary's.
- A **gap** is where a layer attaches above the exhaustion of the layer below
  it; the gap size is attachment − exhaustion below. An **overlap** is where a
  layer attaches below that exhaustion; the overlap size is exhaustion below −
  attachment. The tower is **continuous** only with no gaps or overlaps, and
  only then does it have a total limit (the sum of the limits). A primary that
  attaches above zero and a layer whose rate on line exceeds the layer below it
  are flagged as worth a question, not as errors.
- **Per-occurrence basis.** Every layer is read as responding per occurrence;
  the Program tab states this once. (v1.3's per-location and aggregate bases were
  removed in v1.4 because the coverage arithmetic could not honour them.)
- **Property adequacy (coinsurance):** required limit = insurable value ×
  coinsurance percent. If the limit carried is at least the required limit, the
  insurer pays min(loss, carried) − deductible. Otherwise it pays (carried ÷
  required) × loss − deductible, capped at the carried limit. Payment never goes
  below zero. The client absorbs loss − payment; the penalty share is 1 −
  carried ÷ required; the additional limit needed is required − carried.
  Example: $1,000,000 value at 80% with $600,000 carried, a $100,000 loss and a
  $5,000 deductible: required $800,000, payment (600,000 ÷ 800,000) × 100,000 −
  5,000 = $70,000, client absorbs $30,000, $200,000 more limit needed.
- **Larger placements:** a policy can list the insurers sharing it, each with a
  role (lead or follow), signed line (percent of the placement) and premium
  share. Signed lines should total 100%; the app flags short or over-placement
  and premiums that do not add up to the policy premium. Share of limit = limit
  × signed line; rate on line = premium ÷ share of limit. A policy can also list
  sub-limits with their own deductibles; the policy's limit and deductible stay
  the defaults for everything not listed.

### Strategy: retained losses by year, break-even, worst-year test, TCOR

- **Retention options** are deductibles (or self-insured retentions) with their
  annual premium and an optional aggregate cap, entered by hand (manual options)
  or generated automatically with an estimated premium (see Strategy findings
  below). Manual premiums are not quotes either; nothing in the app is.
- **Retained losses by year.** Each option applies its deductible to the
  account's actual claims, year by year. Claims for the line are grouped by
  policy year (effective ≤ date of loss < expiry). For every option and year:
  **retained = Σ min(incurred, deductible)**, then **min(retained, aggregate cap)**
  where a cap exists; **transferred = incurred − retained**. The comparison uses
  the five most recent policy years by default, including the current year
  (flagged incomplete, with a toggle to exclude it). Trend and development from
  Loss runs can be applied, per claim, before the deductible; both are off by
  default. The basis in use is stated beside the figures in one sentence:
  "Basis: 3 policy years (PY2024 to PY2026; current year included as
  incomplete), raw incurred, as of 16 Nov 2026." The word "replay" does not
  appear anywhere a user reads (v1.5).
- **Across years:** average retained per year, the worst year's retained and
  which year it was.
- **Against the base** (the lowest-deductible option; ties go to the cheaper):
  premium saving = base premium − option premium; additional expected retained =
  option average − base average; **expected total cost = premium + average
  retained**; **net expected saving = premium saving − additional retained**.
- **Break-even retained losses** = the premium saving: the most additional
  retained loss the client can absorb in a year before the option costs more
  than the base.
- **Worst year test.** In the option's worst year, additional
  retained = option retained − base retained in that same year; compared with
  the premium saving and reported as "in PY2023 this option would have cost
  $2,000 more than the base".
- **Maximum annual exposure** = deductible × the most claims seen in any year
  used, or the aggregate cap if lower.
- **No option is marked recommended.** A considerations panel states, for cash
  flow, claim volatility, frequency trend, open reserves and contract
  requirements, what the account's figures show and what would favour a lower or
  a higher retention.
- **Total cost of risk (TCOR)** = premiums + expected retained losses + broker
  fees + risk control spend + internal claims administration. Premiums are the
  account's in-force policies with the option's premium in place of the line
  under analysis; expected retained is the option's average retained plus, for
  other in-force lines with loss runs, their five-year average below their own
  deductible (lines without loss runs count as zero and are flagged). Shown in
  dollars, as a percent of revenue and per $1,000 of revenue, for every option
  side by side. Fees, risk control and claims administration are entered on the
  account and default to zero.
- **Renewal strategy report.** A print-styled route assembles profile and
  exposures, the program layers, five-year losses with the basis stated, the
  findings accepted for discussion, the options (manual and estimated premiums
  side by side) with retained losses by year, TCOR by option, the considerations
  and an **Assumptions and limitations** section generated from the settings
  actually used, including the tolerances and permissible loss ratio. It compares options and
  never says what the client should buy. Every input is exportable as JSON.

#### Strategy limitations (what an actuary would do differently)

The optimizer applies each option's deductible to the account's **own past
claims**, year by year. It is
transparent and easy to audit, and it is not a forecast. In particular:

- **Credibility.** Five years of one account's claims (twelve for Harbourline,
  three for Cedar Ridge) carry little statistical weight. An actuary would blend
  the account's experience with an industry or book expectation, weighting the
  account's own data by its credibility (more claims, more weight), rather than
  taking its average as the expected value.
- **Loss distributions.** The method can only reproduce claim sizes that have
  happened. Retained losses at a higher deductible depend on how many claims
  fall just below or above it, which a fitted severity distribution (and a
  frequency distribution for the count of claims) estimates far better than
  twelve observed amounts. The maximum annual exposure, in particular, is a
  count-based ceiling, not a probability.
- **Development of open claims.** Reserves on open claims are taken at their
  current value unless development factors are entered by hand. An actuary would
  develop each year to ultimate using factors derived from a relevant triangle,
  and would treat the running year's incomplete count as such rather than as a
  full year.
- **Trend.** A single trend rate applied uniformly to every claim ignores that
  frequency and severity trend differently, and that the deductible itself erodes
  with inflation (more of each claim crosses it over time).
- **Aggregate caps and correlation.** The cap is applied to each year's total; a
  distribution-based model would price the cap on the probability of exceeding
  it, including years with more claims than any seen.
- **Expected total cost ignores the time value of money and the cost of
  capital** for funding the retained layer, and treats premium as fixed when a
  higher retention may also change terms or future renewal pricing.

### Placement: subscription layers, several towers, deductible schedules

- **Account tabs.** Each account has Overview, Loss runs, Program, Documents and
  Strategy tabs under its name (`/w/<slug>/accounts/<id>/<tab>`). Strategy
  opens on the policy with the fewest days to expiry that has no outcome yet,
  and remembers the chosen policy in the URL. Old `/placement/…` links
  redirect to the matching tab.
- **Layers and participations.** A program layer (tower, type, attachment,
  limit) carries one or more insurer participations, each with a written
  line (optional), a signed line and a **100% premium**. A v0.5 layer is one
  participation signed at 100%.
  - **The 100% premium convention (v1.5).** Insurers quote a premium as if they
    wrote the whole layer. What an insurer actually receives is its **actual
    premium = 100% premium × signed line ÷ 100**, computed in the domain layer
    and never stored (`layer_participations.premium_100`; values entered before
    v1.5 were already quoted at 100%, so the column was renamed without
    conversion). The participation table shows both; the layer total row shows
    the placed %, the sum of actual premiums and a **100% equivalent** = sum of
    actual premiums ÷ placed share, labelled as such. The CSV schedule uses the
    column `premium_100` and opens with a note line saying so; the import preview
    shows the computed actual premium per row.
  - **Placed share** = Σ signed lines. **Layer premium** = Σ actual premiums.
    **Placed limit** = limit × placed share. **Layer rate on line** = layer
    premium ÷ placed limit. Program premium, rate per $100 of TIV, blended rate
    on line, the strategy report and the findings engine all use actual
    premiums.
  - **Per participation:** exposed limit = limit × signed line; rate on line =
    100% premium ÷ layer limit, which equals actual premium ÷ exposed limit (the
    math shows both forms); premium per $1M exposed; share of layer premium.
  - **Layer blocks (v1.5).** Inside a layer block, insurer segments share the
    full width in proportion to their share of the layer's placed total, not of
    100%: a single insurer at 50% fills the whole block; 15% and 35% fill 30%
    and 70%. The block's top-left label ("50% placed") and the Placement column
    are the only places short or over-placement shows in the diagram.
  - **Program PDF (v1.5).** Export PDF on the Program tab renders a landscape
    summary (title, tiles, the tower diagram with every segment labelled by an
    insurer key, the segment table, the participation table with 100% and actual
    premiums, totals and a fictional-data footer) with `@react-pdf/renderer`,
    files it under Documents → Policy documents as "Program summary — <line
    group> — <as-of date>" and opens it in a new tab.
- **Coverage profile.** 0 to the program top (the highest exhaustion, or the TIV
  when set) is cut at every attachment and exhaustion point. A segment's placed %
  is the sum of the signed shares of every layer in every tower that covers it:
  **Fully placed** within 0.01 points of 100%, **Under-placed** (shortfall % and
  unplaced $ = shortfall × segment width), **Over-placed** (excess %) or **Not
  covered**. The segment table shows the placed % in red whenever it is not 100%
  and the unplaced dollars beside it; within one tower the v0.5 gap and overlap
  checks still apply; across towers overlapping ranges are expected.
- **Program totals:** total premium, total placed limit, **rate per $100 of TIV**
  = total premium ÷ TIV × 100, and a blended rate on line per segment =
  Σ(layer premium ÷ limit) ÷ Σ placed shares of the layers covering it.
- **Sign-down.** When written lines exceed the target share, signed = written ×
  target ÷ Σ written; when they fall short, signed = written and the layer is
  flagged under-subscribed by the difference. Written lines are optional; without
  them, signed lines are entered directly.
- **Deductible schedules.** A policy's deductible field is its **default (all
  other perils)** deductible and is mirrored by the schedule row marked default;
  the two stay in sync. Other rows name a peril or coverage part with a kind:
  **flat** (an amount), **percent of loss** (percent × incurred, clamped to a
  minimum and maximum), **percent of value** (percent × the claim's value at
  risk, clamped; flagged when no value at risk is known, and the minimum is used
  if there is one) or **waiting period** (hours, not dollars; excluded from
  the dollar analysis with a flag).
- **Matching rule in the retention analysis.** Each claim carries a peril (default All other
  perils). The retention optimizer uses the schedule rule whose applies_to equals
  the claim's peril (case-insensitive), otherwise the default rule. A retention
  option replaces only the default deductible amount, so claims under a named
  peril keep their own deductible whichever option is chosen.

### Documents and certificates (v1.4)

- **Four folders per account:** Proposals (status Draft or Final, policy year),
  Submissions (policy year and the markets they went to, chosen from the insurers
  already in the workspace or typed in), Certificates (generated on a policy
  page or uploaded) and Policy documents (optionally linked to a policy). Files
  go to Vercel Blob privately under a random pathname and are served only
  through `/w/<slug>/documents/<id>`, which checks the workspace cookie. The
  limit is 10 MB and the types are pdf, docx, xlsx, csv, png and jpg. A missing
  title, a disallowed type, an oversize file or a submission with no market is
  a field error and stores nothing. Deleting a document deletes its blob, except
  for the demo book's shared `seed/` files, where only the row goes.
- **Certificate of insurance.** The Policy page generates a PDF for the current
  term: named insured, insurers (the layer's participations with signed lines
  when the policy is placed by subscription), policy number, period, limits,
  default deductible, exposure or TIV, the tracked endorsements present, any
  other in-force policies ticked for inclusion, holder, issue date (the as-of
  date) and a plain-language statement that it is informational and confers no
  rights. It is Broker OS's own layout, not an industry form. The PDF is filed
  as a certificate document on the policy and in the account's Certificates
  folder.
- **Reissue rule.** A certificate is flagged **Reissue needed** when its policy
  has a successor (an outcome recorded it as renewed) or its expiry date is on
  or before the as-of date. The flag is derived at read time, never stored.

### Strategy findings (v1.4)

All of these are heuristics computed in `src/lib/domain/strategy.ts` from the
account's own loss history, program layers and the settings on the Strategy tab.
They produce candidates for discussion, never recommendations.

- **Settings.** Risk tolerance per occurrence (default 0.5% of revenue), per
  policy year (default 1% of revenue) and a permissible loss ratio, PLR (default
  0.65). The tab and report carry the sentence "Estimated premiums are derived
  from your loss history and this ratio; they are not quotes."
- **Band analysis.** The program's layers are read bottom up. The primary
  responds from the deductible (band attachment = deductible, band limit =
  limit − deductible). For each band and policy year, **in-band losses = Σ
  min(max(incurred − attachment, 0), limit)**; average per year and worst year
  follow. A band is **working** when any year has an in-band loss or its claim
  frequency exceeds 0.2 per year, else **catastrophe**.
- **Self-insure candidate** when the band limit ≤ the per-occurrence tolerance,
  the worst year's in-band loss ≤ the annual tolerance and the layer premium >
  average in-band loss ÷ PLR; the estimated impact is premium − average ÷ PLR.
  Otherwise the band yields a **raise-deductible candidate** at the
  per-occurrence tolerance and the matching option is generated automatically.
  A catastrophe band never produces a retention candidate; it is priced only,
  with a quota-share alternative noted.
- **Price findings.** **Inverted pricing** when a layer's rate on line is ≥ the
  layer below it (dollar difference = this layer's premium − premium at the lower
  rate). **Participation above the book** when a layer's rate on line is ≥25%
  above the premium-weighted average rate on line of the other lines. **Rate
  change above exposure change** when the renewal's rate change exceeds the
  exposure change by ten points or more. Each states the dollar difference.
- **Limit adequacy (property).** Underinsured by $X when the program top is
  below the TIV; **excess limit** when the top exceeds the TIV by more than 10%,
  priced at the top layer's rate on line.
- **Automatic options:** the current deductible, the per-occurrence tolerance
  and the p50, p75 and p90 claim severities (nearest-rank percentiles, rounded
  to $5,000, or to $25,000 above $100,000), de-duplicated. **Estimated premium =
  current premium − (increase in average retained vs the current deductible) ÷
  PLR**, floored at 25% of the current premium and flagged when the floor
  applies. Manual and estimated premiums sit in two columns; the comparison runs on
  the chosen source, defaulting to manual where one exists.
- **Partial-line retention candidate (v1.5).** For a working band whose limit
  exceeds the per-occurrence tolerance, the engine considers the client taking a
  line on the band instead of the whole band. Client line = the largest whole
  percentage such that line × band limit ≤ per-occurrence tolerance and line ×
  worst-year in-band losses ≤ annual tolerance, minimum 1%, otherwise no
  candidate. In-band losses for the band above the current deductible are the
  losses between the deductible and the band top (average retained at the band
  top minus average retained at the deductible; same for the worst year).
  Premium saving = line × the layer's 100% equivalent premium; expected retained
  = line × average in-band losses; worst-year retained = line × worst-year
  in-band losses; **net expected saving = saving − expected retained**; the
  candidate fires when it is positive and is shown beside the raise-deductible
  candidate for the same band. Where a segment is short of 100% the finding adds
  "This line would also reduce the unplaced share of the segment from X% to Y%."
  Hand-verified: Harbourline Foods, $1M primary at 142,000, deductible 10,000,
  tolerances 125,000 / 250,000 → average in-band 42,400, worst year 115,000, line
  12%, saving 17,040, expected retained 5,088, worst-year retained 13,800, net
  11,952; with a 5,000 per-occurrence tolerance the line is 0% and nothing fires.
- **Modifiers** that temper every finding: a rising claim frequency, a high open
  reserve share, and fewer than three policy years of history.

## Limitations

- **Findings are heuristics.** The band threshold (any in-band loss, or more
  than 0.2 claims a year), the tolerance defaults, the 25%/10-point price
  thresholds and the 10% excess-limit rule are judgement calls a broker should
  challenge; an actuary would fit distributions and model credibility.
- **The 100% premium convention is an assumption.** Every participation premium
  is read as quoted at 100% of its layer and the actual premium is derived from
  the signed line. A slip that records each insurer's actual premium instead must
  be converted (actual ÷ signed line) before import; the app cannot tell the two
  apart.
- **Estimated premiums are not quotes.** They rescale the current premium by the
  change in expected retained losses at a fixed permissible loss ratio and
  ignore expense loads, risk charges, market cycle and minimum premiums.
- **Files are not virus-scanned** and are served to anyone holding the workspace
  link. Upload only fictional documents.
- **Vercel Blob free tier.** Storage and bandwidth are capped; the demo keeps one
  shared copy of its PDFs under `seed/` and the nightly reset re-uses it.

## Changelog

v0.1 — Foundation: workspaces, accounts, contacts, policies, demo book, settings.

v0.2 — Renewals: stages, readiness checklist, tasks, activities, outcomes, rate change math.

v0.3 — Dashboard: book, retention, expiring premium, revenue forecast, concentration.

v0.4 — Loss runs: claims, CSV import, policy-year summary, trend and development, large loss and open claims.

v1 — Program: tower analysis, contract requirements checker, certificates, property adequacy. Additional updates to support large policies.

v1.1 — Marketing: submission package, carriers approached, quotes, like-for-like comparison, market log.

v1.2 — Strategy: retention optimizer, total cost of risk, renewal strategy report.

v1.3 — Account tabs replace Placement; subscription placements with signed lines and multiple towers; deductible schedules with per-peril replay; five more demo accounts.

v1.4 — Documents tab with Vercel Blob; Policy page with certificate generation; automatic strategy findings and estimated retention options; removed Marketing, contract requirements, layer basis, coverage strip and Workers Compensation; ten-account demo book.

v1.5 — Polish: 100% premium basis for participations, proportional layer widths, program PDF export, loss-runs grouping, partial-line retention candidates, copy and wording audit.

Full details in [CHANGELOG.md](CHANGELOG.md).
