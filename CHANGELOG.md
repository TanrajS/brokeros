# Changelog

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
