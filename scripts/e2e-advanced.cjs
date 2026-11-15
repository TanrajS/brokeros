/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v1.3: account tabs, subscription placements, deductible schedules
 * (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-advanced.cjs
 * Reads the seeded workspace; all writes happen in a fresh workspace with the demo book loaded.
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3077";
const SEED = process.env.SEED_SLUG;
const SHOTS = process.env.SHOT_DIR ?? "/tmp";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}
const main = (p) => p.locator("main:visible");
async function settle(p) {
  await main(p).locator("h1, h2").first().waitFor();
  await p.waitForLoadState("networkidle");
}
const section = (p, id) => main(p).locator(`section[aria-labelledby='${id}']`);
const flat = (s) => s.replace(/\s+/g, " ");
const rowText = async (table, label) => flat(await table.locator("tbody tr", { hasText: label }).first().innerText());

async function openAccount(p, slug, account) {
  await p.goto(`${BASE}/w/${slug}`);
  await settle(p);
  await main(p).getByRole("link", { name: account, exact: true }).click();
  await p.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  await settle(p);
  return p.url();
}

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  /* ---------- Navigation and tabs ---------- */
  await page.goto(`${BASE}/w/${SEED}`);
  await settle(page);
  check("Placement is gone from the left navigation", (await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Placement" }).count()) === 0);
  await page.goto(`${BASE}/w/${SEED}/placement`);
  await page.waitForURL(new RegExp(`/w/${SEED}$`));
  check("/placement redirects to the Book", true);

  const harbourUrl = await openAccount(page, SEED, "Harbourline Foods Inc.");
  const tabs = main(page).getByRole("tablist");
  const tabNames = (await tabs.getByRole("tab").allInnerTexts()).map(flat);
  check("five tabs under the account name", /^Overview$/.test(tabNames[0]) && /^Loss Runs/.test(tabNames[1]) && /^Program/.test(tabNames[2]) && /^Marketing/.test(tabNames[3]) && /^Strategy/.test(tabNames[4]), tabNames.join(" | "));
  check("Overview is selected on the account page", (await tabs.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")) === "true");
  check("count badges: 12 claims, 3 layers, 3 quotes, 3 options", /Loss Runs 12/.test(tabNames[1]) && /Program 3/.test(tabNames[2]) && /Marketing 3/.test(tabNames[3]) && /Strategy 3/.test(tabNames[4]));
  check("overview keeps policies, contacts, certificates, tasks and activity", (await section(page, "policies-heading").count()) === 1 && (await section(page, "contacts-heading").count()) === 1 && (await section(page, "tasks-heading").count()) === 1);
  await tabs.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForURL(/\/loss-runs$/);
  await settle(page);
  check("ArrowRight moves to the Loss Runs tab and opens it", (await main(page).getByRole("tab", { name: /^Loss Runs/ }).getAttribute("aria-selected")) === "true");
  await page.keyboard.press("End");
  await page.waitForURL(/\/strategy$/);
  await settle(page);
  check("End jumps to the Strategy tab", (await main(page).getByRole("tab", { name: /^Strategy/ }).getAttribute("aria-selected")) === "true");
  const accountId = harbourUrl.split("/accounts/")[1];
  await page.goto(`${BASE}/w/${SEED}/placement/${accountId}/strategy?years=3`);
  await page.waitForURL(new RegExp(`/accounts/${accountId}/strategy\\?years=3$`));
  check("old /placement bookmark redirects to the account tab with its query string", true);
  await page.goto(`${BASE}/w/${SEED}/placement/marketing`);
  await page.waitForURL(/\/market-log$/);
  await settle(page);
  check("market log moved to /market-log", /Market log/.test(await main(page).locator("h1").innerText()));
  await page.goto(`${harbourUrl}/marketing`);
  await settle(page);
  check("Marketing defaults to the GL renewal (fewest days to expiry, marketed)", /General Liability · Dominion Shield Insurance/.test(await main(page).getByRole("navigation", { name: "Policy being marketed" }).locator('a[aria-current="page"]').innerText()));

  /* ---------- Pacific Northwest Terminals: two-tower placement ---------- */
  const pntUrl = await openAccount(page, SEED, "Pacific Northwest Terminals Ltd.");
  check("Overview policies table shows the 12-deductible chip", /12 deductibles/.test(await section(page, "policies-heading").innerText()));
  await page.goto(`${pntUrl}/program?group=property`);
  await settle(page);
  const adv = section(page, "advanced-heading");
  check("Program opens in Advanced for a multi-tower placement; Simple is disabled", (await adv.count()) === 1 && (await main(page).getByRole("navigation", { name: "Program view" }).getByRole("link", { name: "Simple" }).getAttribute("aria-disabled")) === "true");
  const advText = flat(await adv.innerText());
  check("program premium 755,000 and $0.2517 per $100 of TIV", /\$755,000/.test(advText) && /\$0\.2517/.test(advText) && /TIV \$300,000,000/.test(advText));
  check("coverage 100% at every point", /100% at every point/.test(advText));
  const coverage = adv.locator("table").nth(0);
  check("two segments, both Fully placed", (await coverage.locator("tbody tr").count()) === 2 && (await coverage.locator("tbody tr", { hasText: "Fully placed" }).count()) === 2);
  const parts = adv.locator("table").nth(1);
  const west = await rowText(parts, "Westcoast Re (fictional)");
  check("Westcoast Re: 15% signed, 120,000, exposed 45,000,000 at 0.2667% on line", /15% \$120,000 \$45,000,000 0\.2667%/.test(west), west);
  const b1 = await rowText(parts, "Tower 2 $100M primary: layer total");
  check("B1 layer total 60%, 264,000, 0.4400% on line", /60\.0% short 40% \$264,000 \$60,000,000 0\.4400%/.test(b1), b1);
  check("towers drawn side by side with a coverage strip", (await adv.getByRole("img").count()) === 1 && /Tower 1.*Tower 2.*Placed/.test(flat(await adv.locator("figure").innerText())));
  await adv.screenshot({ path: `${SHOTS}/advanced-program.png` });

  // Inline edit recomputes immediately, before saving
  await parts.getByRole("button", { name: "Edit Pacific Crest Insurance (fictional) on Tower 2 $200M xs $100M" }).click();
  await parts.getByLabel("Signed line %").fill("15");
  const second = flat(await coverage.locator("tbody tr").nth(1).innerText());
  check("Pacific Crest at 15%: 100M–300M segment 90.00% placed, $20,000,000 unplaced, Under-placed", /90\.00%/.test(second) && /\$20,000,000/.test(second) && /Under-placed/.test(second), second);
  check("program premium falls with the draft (310,000 + 264,000 + 181,000 unchanged premium)", /\$755,000/.test(flat(await adv.innerText())));
  await parts.getByRole("button", { name: "Cancel editing Pacific Crest Insurance (fictional)" }).click();
  check("cancelling the edit restores 100%", /100\.00%/.test(flat(await coverage.locator("tbody tr").nth(1).innerText())));

  // Export
  const csv = await page.request.get(`${pntUrl}/program/export?group=property`);
  const csvText = await csv.text();
  const csvLines = csvText.trim().split(/\r?\n/);
  check("placement schedule exports as CSV: header plus 10 insurer lines", csv.status() === 200 && /^tower,layer_type,attachment,limit,insurer,written_line_pct,signed_line_pct,premium,policy_number/.test(csvLines[0]) && csvLines.length === 11 && csvText.includes("Westcoast Re (fictional)"), `${csvLines.length} lines`);

  // Deductible schedule on the property policy
  await page.goto(pntUrl);
  await settle(page);
  await section(page, "policies-heading").locator("tbody tr", { hasText: "$755,000" }).getByRole("link", { name: "Westcoast Re (fictional)", exact: true }).click();
  await page.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await settle(page);
  const sched = section(page, "deductibles-heading");
  const schedText = flat(await sched.innerText());
  check("policy page lists the 12-line deductible schedule with the default row", (await sched.locator("tbody tr").count()) === 12 && /All other perils Default/.test(schedText) && /Earthquake.*10% of loss, minimum \$100,000/.test(schedText) && /72-hour waiting period/.test(schedText), `${await sched.locator("tbody tr").count()} rows: ${schedText.slice(0, 160)}`);
  check("default row cannot be deleted here", await sched.getByRole("button", { name: "Delete All other perils deductible" }).isDisabled());

  // Claims carry perils
  await page.goto(`${pntUrl}/loss-runs?line=Property`);
  await settle(page);
  const claimsText = flat(await section(page, "claims-heading").innerText());
  check("claims table shows the peril and value at risk", /Flood/.test(claimsText) && /VAR \$42,000,000/.test(claimsText) && /Stock/.test(claimsText));

  // Strategy replay uses the schedule
  await page.goto(`${pntUrl}/strategy`);
  await settle(page);
  const opt = section(page, "optimizer-heading").locator("table").first();
  // (20,000 + 260,000 + 101,000 + 35,000 + 55,000) ÷ 5 = 94,200 at the $100,000 default; 136,200 at $500,000
  check("PNT replay respects the schedule: average retained 94,200 / 124,200 / 136,200", /\$94,200 \$124,200 \$136,200/.test(await rowText(opt, "Average retained losses")), await rowText(opt, "Average retained losses"));
  check("assumptions state the schedule in force", /Deductible schedule in force: .*Earthquake: 10% of loss, minimum \$100,000/.test(await section(page, "assumptions-heading").innerText()));
  await main(page).getByRole("link", { name: "Generate report" }).click();
  await page.waitForURL(/strategy\/report/);
  await settle(page);
  const rt = flat(await main(page).locator("article").innerText());
  check("report: subscription program summary, coverage profile, participations and the schedule", /placed on a subscription basis across 2 towers/.test(rt) && /Fully placed/.test(rt) && /Westcoast Re \(fictional\) \(lead\)/.test(rt) && /Deductible schedule in force \(Property\)/.test(rt));

  /* ---------- Other new accounts, dashboard ---------- */
  const kootUrl = await openAccount(page, SEED, "Kootenay Alpine Resorts Inc.");
  await page.goto(`${kootUrl}/program?group=property`);
  await settle(page);
  const kt = flat(await section(page, "advanced-heading").innerText());
  check("Kootenay: 50/50 primary with a single-insurer excess, fully placed", /100% at every point/.test(kt) && /Dominion Shield Insurance.*50%/.test(kt) && /Boreal Casualty Company.*100%/.test(kt));
  const srbUrl = await openAccount(page, SEED, "Summit Ridge Builders Inc.");
  await page.goto(`${srbUrl}/program`);
  await settle(page);
  check("Summit Ridge: simple tower, $10M umbrella requirement short by $5,000,000, wrap-up certificate requested", (await section(page, "tower-heading").count()) === 1 && /Shortfall \$5,000,000/.test(flat(await section(page, "requirements-heading").innerText())) && /Requested/.test(flat(await section(page, "certificates-heading").innerText())));
  await page.goto(`${BASE}/w/${SEED}/dashboard`);
  await settle(page);
  const dash = flat(await main(page).innerText());
  check("dashboard retention still 80.0% count and 87.5% premium with 19 accounts", /80\.0%/.test(dash) && /87\.5%/.test(dash));
  await page.goto(`${BASE}/w/${SEED}/dashboard?lookback=24`);
  await settle(page);
  check("24-month lookback shows Fraser Valley's lost umbrella", /Fraser Valley Logistics/.test(flat(await main(page).innerText())));

  /* ---------- Writes in a fresh workspace ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const w = await ctx2.newPage();
  w.on("pageerror", (e) => errors.push(String(e)));
  w.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await w.goto(`${BASE}/`);
  await w.waitForURL(/\/w\/[a-z0-9]{10}$/);
  const slug = w.url().split("/w/")[1];
  await main(w).getByRole("button", { name: "Load demo book" }).click();
  await main(w).getByRole("link", { name: "Pacific Northwest Terminals Ltd." }).waitFor({ timeout: 45000 });
  const pnt2 = await openAccount(w, slug, "Pacific Northwest Terminals Ltd.");
  await w.goto(`${pnt2}/program?group=property`);
  await settle(w);
  let adv2 = section(w, "advanced-heading");
  await adv2.locator("tbody tr", { hasText: "Tower 2 $200M xs $100M: layer total" }).first().getByRole("button", { name: "Add insurer" }).click();
  let dlg = w.getByRole("dialog");
  await dlg.getByLabel(/^Insurer/).fill("Granville Specialty (fictional)");
  await dlg.getByLabel("Written line (%)").fill("5");
  await dlg.getByLabel("Signed line (%)").fill("10");
  check("signed above written is rejected inline", (await dlg.getByRole("button", { name: "Add insurer" }).isDisabled()));
  await dlg.getByLabel("Written line (%)").fill("");
  await dlg.getByLabel("Premium (CAD)").fill("30000");
  await dlg.getByRole("button", { name: "Add insurer" }).click();
  await adv2.locator("tbody tr", { hasText: "Granville Specialty (fictional)" }).nth(1).waitFor();
  await w.waitForLoadState("networkidle");
  adv2 = section(w, "advanced-heading");
  const over = flat(await adv2.locator("table").nth(0).locator("tbody tr").nth(1).innerText());
  check("adding 10% to B2 makes 100M–300M 110% over-placed", /110\.00%/.test(over) && /Over-placed/.test(over), over);
  const added = adv2.locator("table").nth(1).locator("tbody tr", { hasText: "Granville Specialty (fictional)" }).nth(1);
  await added.getByRole("button", { name: /^Remove Granville Specialty \(fictional\) from Tower 2 \$200M xs \$100M/ }).click();
  await w.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await w.waitForFunction(() => !/110\.00%/.test(document.body.innerText));
  check("removing the line restores 100%", /100\.00%/.test(flat(await section(w, "advanced-heading").locator("table").nth(0).locator("tbody tr").nth(1).innerText())));

  // Import a placement schedule into Harbourline's GL (simple → advanced)
  const harbour2 = await openAccount(w, slug, "Harbourline Foods Inc.");
  await w.goto(`${harbour2}/program?view=advanced`);
  await settle(w);
  await section(w, "advanced-heading").getByRole("button", { name: "Import schedule (CSV)" }).click();
  dlg = w.getByRole("dialog");
  const good = "tower,layer_type,attachment,limit,insurer,written_line_pct,signed_line_pct,premium,policy_number\nTower 2,primary,0,1000000,Cascadia Mutual (fictional),60,50,80000,CM-1\nTower 2,primary,0,1000000,Summit Indemnity (fictional),,50,78000,\nTower 2,primary,0,1000000,Cascadia Mutual (fictional),,10,5000,\nTower 2,primary,0,1000000,Thames Syndicate 2140 (fictional),20,30,40000,\n";
  await dlg.locator("input[type=file]").setInputFiles({ name: "placement.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await dlg.getByText(/rows valid/).waitFor();
  const previewText = flat(await dlg.innerText());
  check("placement import preview: 2 of 4 valid; duplicate insurer and signed above written rejected", /2 of 4 rows valid/.test(previewText) && /duplicate insurer/.test(previewText) && /above the written line/.test(previewText), previewText.slice(0, 200));
  await dlg.getByRole("button", { name: /Import 2 valid rows/ }).click();
  await dlg.getByText(/Added 2 insurer lines on 1 new layer/).waitFor();
  await dlg.getByRole("button", { name: "Done" }).click();
  await section(w, "advanced-heading").getByText("Tower 2").first().waitFor();
  await w.waitForLoadState("networkidle");
  const hv = flat(await section(w, "advanced-heading").innerText());
  check("imported Tower 2 appears: 0–1M segment now 200% over-placed across towers", /Tower 2/.test(hv) && /200\.00%/.test(hv) && /Over-placed/.test(hv));
  await w.goto(`${harbour2}/program`);
  await settle(w);
  check("Advanced switches on automatically once a second tower exists", (await section(w, "advanced-heading").count()) === 1);

  // Deductible schedule writes on Harbourline's GL policy
  await w.goto(harbour2);
  await settle(w);
  await section(w, "policies-heading").locator("tbody tr", { hasText: "General Liability" }).first().getByRole("link").first().click();
  await w.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await settle(w);
  let sch = section(w, "deductibles-heading");
  check("GL policy starts with its default $10,000 row only", (await sch.locator("tbody tr").count()) === 1 && /All other perils Default/.test(flat(await sch.innerText())));
  await sch.getByRole("button", { name: "Add deductible" }).click();
  dlg = w.getByRole("dialog");
  await dlg.getByLabel("Applies to").fill("Earthquake");
  await dlg.getByLabel("Kind").selectOption("percent_of_loss");
  check("a percent rule needs a percent (Save disabled until entered)", await dlg.getByRole("button", { name: "Save" }).isDisabled());
  await dlg.getByLabel("Percent of loss (%)").fill("10");
  await dlg.getByLabel("Minimum (CAD)").fill("100000");
  await dlg.getByLabel("Maximum (CAD)").fill("50000");
  check("minimum above maximum rejected inline", (await dlg.getByText("Maximum must be at least the minimum").count()) === 1);
  await dlg.getByLabel("Maximum (CAD)").fill("");
  await dlg.getByRole("button", { name: "Save" }).click();
  await section(w, "deductibles-heading").locator("tbody tr", { hasText: "Earthquake" }).waitFor();
  await w.waitForLoadState("networkidle");
  sch = section(w, "deductibles-heading");
  check("Earthquake 10% of loss, minimum $100,000 added", /Earthquake Percent of loss 10% of loss, minimum \$100,000/.test(flat(await sch.innerText())));
  await sch.getByRole("button", { name: "Edit All other perils deductible" }).click();
  dlg = w.getByRole("dialog");
  await dlg.getByLabel("Amount (CAD)").fill("12500");
  await dlg.getByRole("button", { name: "Save" }).click();
  await w.waitForFunction(() => /\$12,500/.test(document.body.innerText));
  check("editing the default row updates the policy's deductible", /\$12,500/.test(flat(await main(w).innerText())));
  await sch.getByRole("button", { name: "Import schedule CSV" }).click();
  dlg = w.getByRole("dialog");
  const schedCsv = "applies_to,kind,amount,percent,minimum,maximum,hours,notes\nFlood,flat,250000,,,,,\nStock,flat,,,,,,\nEarthquake,flat,5000,,,,,\nBusiness interruption,waiting_period,,,,,72,\n";
  await dlg.locator("input[type=file]").setInputFiles({ name: "schedule.csv", mimeType: "text/csv", buffer: Buffer.from(schedCsv) });
  await dlg.getByText(/rows valid/).waitFor();
  const sp = flat(await dlg.innerText());
  check("schedule import preview: 2 of 4 valid (missing amount, existing peril)", /2 of 4 rows valid/.test(sp) && /a flat rule needs an amount/.test(sp) && /already has a rule/.test(sp), sp.slice(0, 200));
  await dlg.getByRole("button", { name: /Import 2 valid rows/ }).click();
  await dlg.getByText(/Imported 2 of 4/).waitFor();
  await dlg.getByRole("button", { name: "Done" }).click();
  await section(w, "deductibles-heading").locator("tbody tr", { hasText: "Flood" }).waitFor();
  await w.waitForLoadState("networkidle");
  check("schedule now has four rows", (await section(w, "deductibles-heading").locator("tbody tr").count()) === 4);
  await w.goto(harbour2);
  await settle(w);
  check("policies table chip reads 4 deductibles", /4 deductibles/.test(await section(w, "policies-heading").innerText()));

  // A claim with a peril
  await w.goto(`${harbour2}/loss-runs`);
  await settle(w);
  await section(w, "claims-heading").getByRole("button", { name: "Add claim" }).click();
  dlg = w.getByRole("dialog");
  await dlg.getByLabel("Claim number").fill("DSI-GL-26-0400");
  await dlg.getByLabel("Date of loss").fill("2026-10-01");
  await dlg.getByLabel("Date reported").fill("2026-10-02");
  await dlg.getByLabel("Paid (CAD)").fill("4000");
  await dlg.getByLabel("Peril or coverage part").fill("Earthquake");
  await dlg.getByLabel("Value at risk (CAD)").fill("1,500,000");
  await dlg.getByRole("button", { name: /Save|Add claim/ }).last().click();
  await section(w, "claims-heading").locator("tbody tr", { hasText: "DSI-GL-26-0400" }).waitFor();
  check("claim saved with its peril and value at risk", /Earthquake VAR \$1,500,000/.test(flat(await section(w, "claims-heading").locator("tbody tr", { hasText: "DSI-GL-26-0400" }).innerText())));

  // Mobile
  await w.setViewportSize({ width: 375, height: 760 });
  for (const url of [harbour2, `${pnt2}/program?group=property`, `${pnt2}/strategy`]) {
    await w.goto(url);
    await settle(w);
    const sw = await w.evaluate(() => document.documentElement.scrollWidth);
    check(`no page overflow at 375px: ${url.replace(BASE, "").slice(0, 70)}`, sw <= 376, `scrollWidth=${sw}`);
  }
  await w.goto(harbour2);
  await settle(w);
  const strip = main(w).getByRole("navigation", { name: "Account sections" });
  check("tab strip scrolls horizontally at 375px", await strip.evaluate((el) => el.scrollWidth > el.clientWidth || el.clientWidth <= 375));
  await main(w).locator("h1").screenshot({ path: `${SHOTS}/tabs-mobile.png` }).catch(() => {});

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
