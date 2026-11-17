# Changelog

## v1.5.1 — Ten-account demo book restored with prune script; unique account names and policy numbers; coverage schedule with per-part occurrence and aggregate limits and above-limit retention (2026-11-16)

- **Demo book diagnosis and prune.** The seed was already the ten-account v1.4
  book (`buildDemoBook`); the nineteen- and fourteen-account books seen in the
  app were stale rows in 82 workspaces seeded under v1.2 and v1.3 (the nightly
  "Demo brokerage" workspace was clean). `accounts.is_seed`
  (`0014_account_is_seed`) marks rows the seed writes; `0015` back-fills it for
  the known fictional names that carry no user document and renames any
  duplicate account names or policy numbers " (2)", " (3)" with a notice (the
  database had none). `pruneRetiredDemoAccounts` (`src/server/workspace/prune.ts`)
  deletes `is_seed` accounts whose name starts with Ashgrove, Kestrel, Prairie,
  Bluewater, Copperfield, Maple or Tidewater (`isRetiredDemoAccountName`, whole
  first word, so Maplewood Underwriters is untouched), from one workspace
  (Settings → "Remove retired demo accounts", with counts in the toast) or
  from every workspace (`npm run db:prune-demo`, which prints counts per name).
  Non-seed accounts are never deleted. `demoBookData.test.ts` asserts exactly
  ten accounts and none of the seven names; the Dashboard retention test still
  gives 80.0% / 87.5% because none of the ten resolved renewals sat on a
  removed account.
- **Unique names.** `0016_unique_names` adds unique indexes on
  `accounts (workspace_id, lower(trim(name)))` and
  `policies (account_id, lower(trim(policy_number))) where policy_number is not
  null`. `nameConflict` / `normalizeName` (`src/lib/domain/book.ts`) apply the
  same rule in `createAccount`, `updateAccount`, `createPolicy` and
  `updatePolicy`, which return the field errors "An account named X already
  exists in this workspace" and "Policy number X is already used on this
  account" (also when the database index fires). `checkAccountName` and
  `checkPolicyNumber` run on blur so the message shows before Save.
- **Coverage schedule.** `policy_deductibles` is renamed `policy_coverage_parts`
  with its data (`0017_coverage_parts`: table, indexes and constraints renamed,
  `occurrence_limit` and `aggregate_limit` added, the default row filled from the
  policy's headline limits and created where a policy had limits but no
  deductible). The default row now mirrors deductible, occurrence limit and
  aggregate limit (`syncDefaultCoveragePart`); editing it writes all three back
  to the policy. The policy page section is "Coverage schedule" with Applies to,
  Deductible, Occurrence limit and Aggregate limit; CSV import and export carry
  `occurrence_limit` and `aggregate_limit`. `checkPartLimits` blocks an aggregate
  below the occurrence limit and only warns when a part limit exceeds the
  policy's headline (some insurers write higher sublimits): inline in the
  dialog, in the import preview and in the save toast. The policy page and the
  Overview table show an "N coverage parts" chip whose tooltip lists each part
  with its deductible and limits (`CoveragePartsChip`); the certificate lists
  parts with their own limits as "Sublimits" under the headline limits.
- **Retained above limit.** `replayYear` now returns `retainedAboveLimit` =
  Σ max(0, incurred − the claim's coverage-part occurrence limit), using the
  part's own sublimit, else the policy's headline limit
  (`ReplaySettings.defaultOccurrenceLimit`, passed by `buildStrategyView`);
  `transferred` excludes it. The deductible retention is unchanged, so every
  hand-verified figure holds; expected total cost = premium + average retained +
  average retained above limit, with the extra term shown as its own column in
  "Retained losses by year at each deductible" and its own row in the comparison
  only when it is non-zero. Tests: Harbourline unchanged under its $1,000,000
  headline limit; a $600,000 Stock claim against a $250,000 Stock occurrence
  limit with a $10,000 deductible retains 10,000 below and 350,000 above
  (expected total cost 502,000); a seed-wide test proves no demo claim exceeds a
  part or headline limit, so Harbourline, Cedar Ridge and Terminals are
  untouched.
- **Seed.** Pacific Northwest Terminals' property schedule carries sublimits:
  Stock $25,000,000 per occurrence, Flood $50,000,000 per occurrence and
  aggregate, Earthquake $100,000,000 aggregate, Equipment breakdown
  $10,000,000, Transit $2,000,000, Glass $250,000, on the existing eleven named
  parts (no row added, deductibles unchanged).

## v1.5 — Polish: 100% premium basis for participations, proportional layer widths, program PDF export, loss-runs grouping, partial-line retention candidates, copy and wording audit (2026-11-16)

- **100% premium basis.** `layer_participations.premium` is renamed
  `premium_100` (`0013_premium_100`, a rename with no value conversion: entered
  values were already quoted at 100%). The domain computes `actualPremium` =
  100% premium × signed line ÷ 100 and never stores it. `layerSummary` now
  returns, per insurer, the actual premium, `shareOfPlaced` (signed line ÷
  placed share) and a rate on line defined as 100% premium ÷ layer limit (equal
  to actual premium ÷ exposed limit; the math shows both forms), and per layer
  the `premium100Equivalent` (Σ actual ÷ placed share). Program premium, rate per
  $100 of TIV, blended rate on line, the strategy report and the findings engine
  use actual premiums. The participation table has the columns Insurer, Written
  line, Signed line, 100% premium, Actual premium, Exposed limit, Rate on line and
  Share of layer premium; the layer total row shows the placed %, the sum of
  actual premiums and the labelled 100% equivalent. CSV import and export use
  `premium_100`, the export opens with a "# premium_100: premium quoted at 100%
  of the layer" note line the import skips, and the import preview shows the
  computed actual premium per row. The Pacific Northwest Terminals seed is
  restated at 100% (Westcoast Re 800,000, Summit 720,000, Granville 780,000,
  Kitsilano 800,000; Cascadia 450,000, Northgate 480,000, Thames 420,000; Pacific
  Crest 300,000, Ironwood 320,000, Maplewood 280,000) and Kootenay's shared
  primary at 330,000 each, so every actual premium, layer premium (310,000 /
  264,000 / 181,000), the 755,000 program premium and every rate on line are
  unchanged and the existing expected values hold. The "line priced above the
  layer" test re-prices Maplewood's 100% premium to 560,000 (actual 84,000) and
  still expects 0.28%.
- **Layer block widths.** Insurer segments share a layer block in proportion to
  their share of the layer's placed total (a single insurer at 50% fills the
  block; 15% and 35% fill 30% and 70%). The placed percentage moved to a small
  "50% placed" label in the block's top-left corner and to the layer total row;
  the Placement column and segment table remain the only places under- or
  over-placement shows. Mobile uses the same blocks.
- **Program PDF export.** Export PDF on the Program tab renders
  `programSummaryContent` (pure, `src/lib/domain/programSummary.ts`, tested on
  the Terminals case) with `@react-pdf/renderer` (`src/server/program/pdf.tsx`):
  landscape Letter, title with account, line group, as-of date and workspace
  name, the summary tiles, the tower diagram redrawn to scale with insurer
  segments by placed share (each labelled with an insurer key so nothing rests
  on colour), the Placement column and legend, the segment table, the
  participation table with 100% and actual premiums, program totals and a footer
  stating the data is fictional and premiums are as entered. `exportProgramPdf`
  files it under Documents → Policy documents as "Program summary — <line
  group> — <as-of date>" and the button opens it in a new tab. Disabled, with
  the reason, when Blob is not configured.
- **Loss runs tab.** The Data quality panel is gone; every flag stays as a small
  badge on its claim row with the reason on hover (`CLAIM_FLAG_REASONS`), and a
  "Flagged only" filter narrows the claims table. The policy-year table is split
  into Active and in progress (in force, or in a renewal stage with no outcome;
  soonest expiry first) and Expired (expired or closed; most recent first) by
  `groupPolicyYears`, three rows each with a "Show N more" link remembered in the
  URL (`active=all`, `expired=all`) and counts in the group headers.
  `loadLossRunInputs` now carries each policy's renewal status and whether an
  outcome exists.
- **Strategy wording and partial-line retention.** "Replay" and "replaying" are
  gone from every user-facing string, the README and the report: the basis line
  reads "Basis: 3 policy years (PY2024 to PY2026; current year included as
  incomplete), raw incurred, as of 16 Nov 2026.", the per-year table is
  "Retained losses by year at each deductible" (`RetainedByYearTable` replaces
  `ReplayTable`), the method sentence is "Each option applies its deductible to
  the account's actual claims, year by year.", and "running year" became
  "current year" everywhere a user reads it (two wording assertions in
  `strategy.test.ts` restated; no figure changed). New `partial_line` finding in
  `bandAnalysis`: for a working band whose limit exceeds the per-occurrence
  tolerance, client line = the largest whole % with line × band limit ≤
  per-occurrence tolerance and line × worst-year in-band ≤ annual tolerance
  (minimum 1%); saving = line × 100% equivalent premium, expected retained =
  line × average in-band, worst-year retained = line × worst-year in-band, net =
  saving − expected retained, candidate when net > 0, with the sentence "This
  line would also reduce the unplaced share of the segment from X% to Y%." when
  a segment is short. The suggested action reads "Candidate: client retains a
  12% line of Tower 1 $1M primary alongside the insurers; recommended for
  discussion." and the finding sits beside the raise-deductible candidate for
  the same band. Hand-verified in `findings.test.ts` (Harbourline 142,000: line
  12%, saving 17,040, expected retained 5,088, worst-year retained 13,800, net
  11,952; 0% and no candidate at a 5,000 tolerance).
- **Copy audit.** Helper sentences a finished product would not show were
  removed from the Book, Dashboard, Renewals, Program, Loss runs, Strategy,
  Documents and Policy pages; where a new user might need the content it moved
  to an info icon tooltip on the heading (`InfoTip`). Units in column headers,
  the as-of date in the header, Show the math, validation messages, empty states
  and every statement of a changeable assumption stay. Wording follows the
  glossary in `CLAUDE.md` (expiring policy, successor policy, signed line,
  written line, 100% premium, actual premium, placed, short, exposed limit, rate
  on line, band, deductible, retention, tolerance, basis); sentence case; dates
  as 16 Nov 2026; "as of" in prose; buttons are verbs (Export PDF, Save option,
  Save tolerances). The tab is "Loss runs". The per-occurrence basis is stated
  once, in the Program heading's tooltip.
- Browser smoke tests updated for the new strings (`e2e-strategy`,
  `e2e-lossruns`, `e2e-advanced`, `e2e-program`); not run in this session.

## v1.4 — Documents tab with Vercel Blob; Policy page with certificate generation; automatic strategy findings and estimated retention options; removed Marketing, contract requirements, layer basis, coverage strip and Workers Compensation; ten-account demo book (2026-11-14)

- **Removals.** The Marketing tab, `submissions` and `quotes` tables, the
  Dashboard market-log card and the report's market-results section are gone.
  Retention options that were imported from quotes keep their premium in
  `quote_options.premium` and become manual options; only the quote link is
  dropped (`0011_removals`). Contract
  requirements (table, checker, report section, tests), the `basis` column on
  program layers (per-occurrence is assumed and stated once on the Program tab),
  the coverage strip (the segment table stays; Placed % is red when it is not
  100% and the unplaced dollars are shown) and Workers Compensation (line of
  business, the payroll-by-class checklist item and every demo policy or claim
  using it; `0010_remove_workers_compensation` deletes existing rows) were
  removed. Payroll stays as an exposure basis. Tests for removed features were
  deleted, not skipped. Harbourline and Cedar Ridge replay figures and the
  Pacific Northwest Terminals coverage figures are unchanged with their existing
  expected values.
- **Documents tab** (`documents` table, `0012_documents`). Four folders per
  account: Proposals (Draft/Final, policy year), Submissions (policy year,
  markets picked from the workspace's insurers or typed in), Certificates and
  Policy documents (optionally linked to a policy). Uploads go through a server
  action to Vercel Blob (private, random pathname, 10 MB, pdf/docx/xlsx/csv/png/
  jpg); downloads stream through `/w/<slug>/documents/<id>`, which checks the
  workspace cookie; deleting a document deletes its blob. Lists filter by policy
  year and status, sort newest first, rename inline, download and delete with a
  confirm. A missing title, bad type, oversize file or a submission without a
  market is a field error and stores nothing. Deleting an account, resetting a
  workspace or replacing it with the demo book deletes the uploaded files too
  (`deleteUserBlobs`); seed files are shared and stay. Demo banner, empty-folder
  upload prompt, keyboard and 375 px. `src/lib/domain/documents.ts` holds the file
  rules, the policy-year label and the certificate reissue rule.
- **Policy page** (`/w/<slug>/accounts/<id>/policies/<policyId>`) now also
  shows the claims whose loss date falls in the term with the line's policy-year
  summary, the program layers of its line group with the tower analysis, a
  Certificates panel and the documents linked to the policy. **Certificate
  generation:** holder name and address, description of operations and a
  checkbox list of other in-force policies; a live preview; the PDF is rendered
  server-side with `@react-pdf/renderer` (`src/server/certificates/pdf.tsx`)
  from `certificateContent` in `src/lib/domain/certificates.ts` and filed as a
  `certificate` document. A certificate is flagged **Reissue needed** when the
  policy has a successor or has expired. The v0.5 `certificates` table and the
  Renewals-page panel were removed.
- **Strategy findings** (`src/lib/domain/strategy.ts`): tolerance settings per
  account (per occurrence 0.5% of revenue, per policy year 1%, permissible loss
  ratio 0.65 by default) saved from the tab; `bandAnalysis` (working versus
  catastrophe bands, self-insure and raise-deductible candidates),
  `priceFindings` (inverted pricing, participation ≥25% above the other lines'
  premium-weighted rate on line, renewal rate change ≥10 points above exposure
  change), `limitAdequacy` (underinsured, excess limit above TIV by >10%),
  `automaticOptions` (current deductible, per-occurrence tolerance, p50/p75/p90
  severities; estimated premium = current − increase in retained ÷ PLR, floored
  at 25% and flagged), `modifiers` and `strategyFindings`. The tab lists the
  findings by impact with Show the math and an Accept-into-report toggle
  (`accounts.accepted_findings`); the report gains "Findings and candidates for
  discussion" and states the tolerances and PLR in Assumptions. Manual and
  estimated premiums are two columns; the replay runs on the chosen source. Hand-
  verified in `src/lib/domain/__tests__/findings.test.ts` (Harbourline $125,000
  option: average 61,000, worst 135,000 in PY2023, increase 42,400, credit
  65,231, estimated premium 76,769, expected total cost 137,769; inverted pricing
  and Maplewood participation thresholds; catastrophe bands never produce a
  retention candidate).
- **Ten-account demo book.** Harbourline, Cedar Ridge, Pacific Northwest
  Terminals and Kootenay are fully populated (five policy years of claims on at
  least two lines, advanced programs for Terminals and Kootenay, deductible
  schedules on every Property policy, documents in all four folders including a
  generated certificate, tolerance settings and manual options). Fraser Valley,
  Summit Ridge, Coastline Dental, Harbourview Inns & Taverns (hospitality),
  Bramblewood Garden Centres (retail) and Northwind Engineering Partners
  (professional services) each carry at least three policy years of claims, a
  simple program, one proposal and one submission. The trailing-12-month
  resolved set is still exactly 10 renewals, 8 renewed, 1 lost, 1 non-renewed,
  $1,240,000 expiring and $1,085,000 renewed (87.5% / 80.0%), and the
  120/121/90/60/30/0-day boundary policies remain. Seed PDFs are generated by the
  seed (`demoDocuments.tsx`), uploaded to Blob exactly once under `seed/` and
  shared by every demo workspace (`documents.is_seed`); New workspace from demo
  and the nightly reset reference the same blobs, and deleting a seed document
  removes only the row.
- **Program diagram:** insurer-only layer blocks and a per-segment Placement
  column; hatched unplaced blocks removed. Each layer block shows only its
  insurer segments proportional to their signed shares inside the outline; the
  Placement column to the right sits on the same dollar scale with one block per
  coverage segment (green at 100%, red below or above, "over" noted), lists the
  contributors on hover and scrolls to the matching segment-table row on click.
  A legend names every insurer and the two placement states; at 375 px the
  towers stack and the Placement column runs horizontally beneath them.
- **Operations.** Environment variables are now `DATABASE_URL`,
  `BLOB_READ_WRITE_TOKEN` and `CRON_SECRET` (`.env.example`, Settings About).
  `vercel.json` schedules `/api/cron/reset-demo` daily; it re-loads the demo
  book into workspaces with `reset_nightly` (set with `SEED_NIGHTLY_RESET=1`).
  Account tabs are Overview, Loss Runs, Program, Documents, Strategy. Browser
  suites updated; `scripts/e2e-documents.cjs` covers the Documents tab, the
  Policy page certificate flow and the findings UI.

## v1.3 — Account tabs, subscription placements, deductible schedules (2026-11-14)

Account tabs replace Placement; subscription placements with signed lines and multiple towers; deductible schedules with per-peril replay; five more demo accounts.

- **Account tabs.** Placement leaves the left navigation. The Account page is
  the Overview tab and gains Loss Runs, Program, Marketing and Strategy under
  the account name (`/w/<slug>/accounts/<id>/<tab>`). Tabs are a keyboard
  tablist (arrow keys, Home/End, Enter), show count badges (claims, layers,
  quotes, options) and scroll horizontally at 375 px. Old `/placement/…` URLs
  redirect to the matching tab; the market log lives at `/w/<slug>/market-log`.
  Marketing and Strategy default to the policy with the fewest days to expiry
  that has no outcome yet, remembered in the URL.
- **Subscription placements** (`program_layers` + `layer_participations`
  replace `tower_layers`; existing layers are converted automatically into one
  layer in "Tower 1" with one participation signed at 100%). New domain
  functions `layerSummary`, `coverageProfile`, `programTotals`, `signDown`,
  `towerInputsFrom`, `validatePlacementRows`. Layer types gain `quota_share`;
  layers carry a basis (per occurrence, per location, aggregate) and a tower
  label; a Property line group joins GL and Auto.
- **Program tab:** Simple / Advanced toggle (Advanced switches on by itself
  when a layer has several insurers or there is more than one tower). The
  advanced view draws the towers side by side on one dollar scale with each
  layer segmented by insurer share and a coverage strip (green 100%, amber
  under, red over or not covered), then a participation table editable inline
  with layer and program totals that recompute as you type. Import a placement
  schedule CSV (preview and validate: percentages 0–100, signed ≤ written,
  non-negative amounts, duplicate insurer in a layer rejected) and export the
  same schedule as a slip-style CSV. The strategy report shows the coverage
  profile and participations when a program is advanced.
- **Deductible schedules** (`policy_deductibles`): per-peril rules of kind
  flat, percent of loss, percent of value or waiting period, with minimum,
  maximum, hours and notes. The policy's deductible field is the default (all
  other perils) row and the two stay in sync. `deductibleForClaim` and
  `matchRule` in `src/lib/domain/deductibles.ts`. Claims gain a peril (default
  All other perils) and an optional value at risk; the claims CSV import accepts
  both as optional columns. The retention replay uses the matching rule per
  claim and lets an option replace only the default deductible, so the
  Harbourline and Cedar Ridge figures are unchanged (tested). Policy pages get a
  Deductible schedule section with add, edit, delete and Import schedule CSV;
  policy tables show an "N deductibles" chip; the strategy report lists the
  schedule in force.
- **Demo book:** five more fictional accounts (Pacific Northwest Terminals with
  the two-tower $300M placement and a 12-line schedule; Kootenay Alpine Resorts;
  Fraser Valley Logistics; Summit Ridge Builders; Coastline Dental Group), each
  with five policy years of claims, a program, a contract requirement, a
  certificate, three to five submissions with quotes and retention options.
  Their current terms run from 2025-11-12 to a longer term, so nothing of theirs
  enters the trailing-12-month resolved set and the Dashboard still shows 80.0%
  count and 87.5% premium retention. The 14-account base book every earlier test
  pins is unchanged; `buildFullDemoBook` adds the five.
- **Migrations** `0006_advanced_placement`, `0007_convert_tower_layers`
  (custom data copy), `0008_drop_tower_layers`, `0009_property_line_group`.

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
