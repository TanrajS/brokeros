# Broker OS

Broker OS is a renewal-first workspace for a commercial insurance brokerage. It
keeps a brokerage's book of business in one place (accounts, contacts and
policies) and counts every expiry from a workspace-wide **as-of date** rather
than the real clock, so a renewal pipeline, dashboard and placement workflow
can be built on top of numbers that are stable, explainable and testable.
Version 0.1 laid the foundation: shared workspaces, the book, account and policy
management, a fictional demo book and settings. Version 0.2 added the Renewals
module: a stage board, readiness checklists, tasks, an activity log, renewal
outcomes and rate-change math. Version 0.3 adds the Dashboard: the book in
force, retention, expiring premium, a revenue forecast and concentration.

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

## Changelog

v0.1 — Foundation: workspaces, accounts, contacts, policies, demo book, settings.

v0.2 — Renewals: stages, readiness checklist, tasks, activities, outcomes, rate change math.

v0.3 — Dashboard: book, retention, expiring premium, revenue forecast, concentration.

Full details in [CHANGELOG.md](CHANGELOG.md).
