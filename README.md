# Broker OS

Broker OS is a renewal-first workspace for a commercial insurance brokerage. It
keeps a brokerage's book of business in one place (accounts, contacts and
policies) and counts every expiry from a workspace-wide **as-of date** rather
than the real clock, so a renewal pipeline, dashboard and placement workflow
can be built on top of numbers that are stable, explainable and testable.
Version 0.1 laid the foundation: shared workspaces, the book, account and policy
management, a fictional demo book and settings. Version 0.2 adds the Renewals
module: a stage board, readiness checklists, tasks, an activity log, renewal
outcomes and rate-change math.

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

## Changelog

v0.1 — Foundation: workspaces, accounts, contacts, policies, demo book, settings.

v0.2 — Renewals: stages, readiness checklist, tasks, activities, outcomes, rate change math.

Full details in [CHANGELOG.md](CHANGELOG.md).
