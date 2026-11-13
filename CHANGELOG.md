# Changelog

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
