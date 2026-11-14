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
Version 0.4 opened Placement with Loss Runs: claims, CSV import and a
policy-year summary with loss ratio, frequency and severity. Version 1 added the
Program tab: tower analysis, a contract requirements checker, certificates of
insurance and property adequacy, plus co-insurers and sub-limits on policies.
Version 1.1 adds the Marketing tab: a submission package, carriers approached,
quotes, a like-for-like quote comparison and a workspace-wide market log.

## Local setup

1. **Create a Neon Postgres database** at <https://neon.tech> and copy its
   connection string (Connect → Connection string).
2. **Configure the only secret:**

   ```bash
   cp .env.example .env.local
   # edit .env.local and paste the string into DATABASE_URL
   ```

3. **Install, migrate, seed (optional) and run:**

   ```bash
   npm install
   npm run db:migrate                     # creates the tables
   SEED_AS_OF=2026-11-12 npm run db:seed  # optional: a demo workspace; omit SEED_AS_OF to use today
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
  exist). Duplicate claim numbers on an account are allowed but flagged. The data
  quality panel lists claims outside policy periods, duplicates, closed with a
  reserve, reported before the loss, or dated after the as-of date.
- **CSV import** takes the template columns in any order. Every row is checked
  for missing or malformed dates (YYYY-MM-DD), future dates, an unknown line,
  missing or non-numeric amounts, an unknown status and duplicate numbers. Only
  valid rows are imported, all in one database transaction.

### Program: tower, contract requirements, certificates, adequacy

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
- **Contract requirements** compare each required coverage with the account's
  current policies. Provided per-occurrence and aggregate limits are the largest
  found among policies in that line; endorsements are the union of the line's
  endorsements. **Shortfall** = required − provided (never below zero). Status is
  Meets, Shortfall or Missing coverage (no policy in the line). Workers
  Compensation is statutory: it is met by having a policy. An Umbrella/Excess
  requirement is met by the tower's umbrella and excess layers (or an umbrella
  policy).
- **Counting the umbrella** is an option, off by default: when on, the tower's
  umbrella and excess limits are added to the primary's per-occurrence limit for
  the comparison. They never count toward an aggregate requirement. Whether a
  contract accepts an umbrella toward its limit is contract-specific, so both
  bases are shown and the decision is left to you.
- **Certificates of insurance** have a derived status, never stored:
  **Requested** until an issue date is set (and the required-by date has not
  passed); **Expired** when the required-by date is before the as-of date and no
  certificate was issued; **Issued** while every underlying policy (the policies
  in the requested lines that were in force on the issue date) is still in force
  at the as-of date with no successor; **Reissue needed** once any underlying
  policy has expired, has been renewed with a successor policy, or a requested
  line had no policy in force on the issue date. Issue and Reissue stamp the
  as-of date. The Renewals page lists every certificate needing reissue.
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

### Marketing: submissions, quotes, comparison and the market log

- **Carriers approached** move through planned → submitted → quoted → bound,
  with declined and no response as exits (both can be reopened). A quote can be
  recorded only against a submission that has been sent (submitted, or quoted
  for a further option). Only one submission per policy can be bound; an expired
  quote cannot be bound, and nothing can be bound once the policy has an
  outcome. Binding opens the Renewed outcome with the quote's carrier, premium,
  limits, deductible, commission and exposure filled in, and the new policy
  takes the quote's endorsements. **Days to respond** = response date − sent
  date; while a submission is outstanding the app shows days waiting (as-of date
  − sent date). A quote whose valid-until date is before the as-of date is
  flagged expired.
- **Like-for-like comparison**, per quote against the expiring policy:
  - **Premium change** = quoted premium ÷ expiring premium − 1.
  - **Rate** = premium ÷ exposure units on the v0.2 basis ($1,000 of revenue or
    payroll, 100 sq ft, or per unit), using the exposure the carrier quoted on
    (or the expiring exposure); **rate change** = quote rate ÷ expiring rate − 1.
  - **Premium per $1M** = premium ÷ occurrence limit × 1,000,000.
  - **Commission** = quoted premium × the quote's own commission rate, shown
    beside the client's cost.
  - **Terms**: occurrence limit, aggregate limit, deductible and the four
    endorsements. Against the **expiring terms** a term matches only when it is
    the same (a higher limit or a lower deductible is a difference, marked as
    broader; a higher deductible is flagged as more retained risk). Against a
    **contract requirement** a limit matches when it meets the requirement, only
    the required endorsements are checked, and the deductible is not specified.
    The result is a count such as "5 of 7 terms match" with every mismatch
    listed, never a combined score.
- **Normalise** keeps only quotes whose occurrence limit, aggregate limit and
  deductible all match the target, so what remains differs on price. Endorsement
  differences stay visible but do not exclude a quote. The app says how many
  quotes were excluded and why.
- **Market log**, per carrier, over submissions sent within the lookback window:
  **hit ratio** = quotes ÷ submissions (a submission with several quote options
  counts once); **bind ratio** = binds ÷ quotes; median days to respond over
  submissions with a response date; declines by reason. A carrier with three or
  more submissions and no quotes is flagged.

## Changelog

v0.1 — Foundation: workspaces, accounts, contacts, policies, demo book, settings.

v0.2 — Renewals: stages, readiness checklist, tasks, activities, outcomes, rate change math.

v0.3 — Dashboard: book, retention, expiring premium, revenue forecast, concentration.

v0.4 — Loss runs: claims, CSV import, policy-year summary, trend and development, large loss and open claims.

v1 — Program: tower analysis, contract requirements checker, certificates, property adequacy. Additional updates to support large policies.

v1.1 — Marketing: submission package, carriers approached, quotes, like-for-like comparison, market log.

Full details in [CHANGELOG.md](CHANGELOG.md).
