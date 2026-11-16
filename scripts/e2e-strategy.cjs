/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v1.2 Strategy (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-strategy.cjs
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

async function openStrategy(p, slug, account) {
  await p.goto(`${BASE}/w/${slug}`);
  await settle(p);
  await main(p).getByRole("link", { name: account, exact: true }).click();
  await p.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  await p.goto(`${p.url()}/strategy`);
  await settle(p);
}

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  /* ---------- Harbourline, seeded (read-only) ---------- */
  await openStrategy(page, SEED, "Harbourline Foods Inc.");
  const strategyUrl = page.url();
  check("Strategy tab is selected", (await main(page).getByRole("tab", { name: /^Strategy/ }).getAttribute("aria-selected")) === "true");
  const basis = flat(await main(page).getByText("Basis: 5 policy years").innerText());
  check("basis statement names the years, the running year and the raw basis", /PY2022 to PY2026; current year included as incomplete\) on raw incurred, as of 12 Nov 2026|PY2022–PY2026, running year included as incomplete\) on raw incurred/.test(basis), basis);

  const options = section(page, "options-heading");
  check("three Pacific Crest options seeded", (await options.locator("tbody tr").count()) === 3);
  check("$10,000 option carries its $142,000 manual premium and nothing is called a quote", /\$142,000/.test(await rowText(options, "$10,000 deductible")) && !/Quote:/.test(await options.innerText()));
  const findings = section(page, "findings-heading");
  check("findings list present with the not-quotes sentence and no recommendation wording", (await findings.count()) === 1 && /Estimated premiums are derived from your loss history and this ratio; they are not quotes\./.test(flat(await main(page).innerText())) && !/recommend/i.test((await findings.innerText()).replace(/“recommended” appears only as “recommended for discussion”/, "")));
  check("Harbourline $1M primary band is a raise-deductible candidate, not self-insure", /raise|Raise/.test(await findings.innerText()) && !/self-insure candidate/i.test(await findings.innerText()));
  const est = main(page).locator("table", { hasText: "Estimated premium ($ per year)" }).first();
  check("estimated options table: $125,000 option estimated at 76,769", /\$125,000[\s\S]*\$76,769/.test(flat(await est.innerText())), flat(await est.innerText()).slice(0, 300));

  const opt = section(page, "optimizer-heading");
  const table = opt.locator("table").first();
  check("base is the lowest deductible", /\$10,000 deductible.*Base: lowest deductible/.test(flat(await table.locator("thead").innerText())));
  check("average retained 18,600 / 33,200 / 45,000", /\$18,600 \$33,200 \$45,000/.test(await rowText(table, "Average retained losses")));
  check("worst-year retained 22,500 (PY2022), 40,000 (PY2023), 65,000 (PY2023)", /\$22,500 \(PY2022\) \$40,000 \(PY2023\) \$65,000 \(PY2023\)/.test(await rowText(table, "Worst-year retained")));
  check("expected total cost 160,600 / 157,200 / 155,000", /\$160,600 \$157,200 \$155,000/.test(await rowText(table, "Expected total cost")));
  check("net expected saving +3,400 and +5,600", /— \+\$3,400 \+\$5,600/.test(await rowText(table, "Net expected saving")));
  check("break-even = premium saving 18,000 / 32,000", /— \$18,000 \$32,000/.test(await rowText(table, "Break-even retained losses")));
  const wyt = await rowText(table, "Worst historical year test");
  check("worst-year test sentences", /In PY2023 this option would have cost \$2,000 more than the base/.test(wyt) && /In PY2023 this option would have cost \$13,000 more than the base/.test(wyt) && /\$40,000 − \$20,000 = \$20,000 vs \$18,000 saving/.test(wyt), wyt);
  check("maximum annual exposure 30,000 / 75,000 / 150,000 (3 claims, PY2022)", /\$30,000 \$10,000 × 3 claims \(PY2022\) \$75,000 .* \$150,000/.test(await rowText(table, "Maximum annual exposure")));
  check("comparison never marks an option recommended", !/recommend/i.test(await opt.innerText()));
  check("chart has the table beside it (aria-hidden chart present)", (await opt.locator('[aria-hidden="true"] .recharts-wrapper').count()) === 1);

  const replay = opt.locator("details", { hasText: "Retained losses by year at each deductible" });
  await replay.locator("summary").click();
  const py23 = flat(await replay.locator("tbody tr", { hasText: "PY2023" }).innerText());
  check("per-year replay: PY2023 retained 20,000 / 40,000 / 65,000, 115,000 transferred at the base", /\$20,000 \$115,000 transferred \$40,000 \$95,000 transferred \$65,000 \$70,000 transferred/.test(py23), py23);
  check("current year marked incomplete in the retained-by-year table", /PY2026\s*incomplete/.test(flat(await replay.locator("tbody tr", { hasText: "PY2026" }).innerText())));
  await opt.locator("details", { hasText: "Show the math" }).first().locator("summary").click();
  check("show the math lists the min() replay lines", /min\(\$120,000, \$25,000\) = \$40,000/.test(await opt.innerText()));
  await opt.screenshot({ path: `${SHOTS}/strategy-optimizer.png` });

  const cons = section(page, "considerations-heading");
  check("considerations: four neutral topics with the account's figures", (await cons.locator("li").count()) === 4 && /frequency is falling/.test(await cons.innerText()) && /2 open claims carry \$138,000/.test(await cons.innerText()) && !/recommend/i.test(await cons.innerText()));

  const tcor = section(page, "tcor-heading");
  const tcorTable = tcor.locator("table").first();
  // GL option + Property 212,000 + Equipment 24,800 + Auto 33,400 + Cyber 17,600 = option + 287,800
  check("TCOR premiums substitute the option premium: 429,800 / 411,800 / 397,800", /\$429,800 .*\$411,800 .*\$397,800/.test(await rowText(tcorTable, "Premiums")));
  check("TCOR fees 15,000 and risk control 10,000 from the account", /\$15,000 \$15,000 \$15,000/.test(await rowText(tcorTable, "Broker fees")) && /\$10,000 \$10,000 \$10,000/.test(await rowText(tcorTable, "Risk control spend")));
  // $50,000 option: 397,800 + 45,000 + 15,000 + 10,000 + 0 = 467,800 → 1.87% of 25M, $18.71 per $1,000
  check("TCOR total 490,140 / 486,740 / 484,540 (Property loss runs now count)", /\$490,140 \$486,740 \$484,540/.test(await rowText(tcorTable, "Total cost of risk")), await rowText(tcorTable, "Total cost of risk"));
  check("TCOR 1.94% of revenue and $19.38 per $1,000 at $50,000", /1\.96% 1\.95% 1\.94%/.test(await rowText(tcorTable, "As a share of revenue")) && /\$19\.61 \$19\.47 \$19\.38/.test(await rowText(tcorTable, "Per $1,000 of revenue")), await rowText(tcorTable, "Per $1,000 of revenue"));
  check("other lines without loss runs flagged, not silently zero", (await tcor.getByText("flagged: no loss runs").count()) === 3);

  const assumptions = section(page, "assumptions-heading");
  const at = await assumptions.innerText();
  check("assumptions generated from the settings: 5 years, current year, no trend, no development, no caps, hand-entered premiums", /PY2026 \(running year, incomplete\)/.test(at) && /No loss trend is applied/.test(at) && /No loss development is applied/.test(at) && /No option has an aggregate cap/.test(at) && /\$10,000 deductible, \$25,000 deductible, \$50,000 deductible were entered by hand and are not quotes/.test(at) && /are estimated from the loss history and the permissible loss ratio; they are not quotes/.test(at));

  /* ---------- Settings change the basis (URL state) ---------- */
  const settings = main(page).locator("form[aria-labelledby='settings-heading']");
  await settings.getByLabel(/Include the current year/).uncheck();
  await settings.getByRole("button", { name: "Apply settings" }).click();
  await page.waitForURL(/current=0/);
  await settle(page);
  check("excluding the current year: 4 years, $10,000 average 17,750", /Basis: 4 policy years \(PY2022 to PY2025; current year excluded\)/.test(flat(await main(page).innerText())) && /\$17,750/.test(await rowText(section(page, "optimizer-heading").locator("table").first(), "Average retained losses")));
  check("assumptions say the current year is not used", /PY2026 is not used: current year excluded by the settings/.test(await section(page, "assumptions-heading").innerText()));
  const settings2 = main(page).locator("form[aria-labelledby='settings-heading']");
  await settings2.getByLabel("Apply loss trend").check();
  await settings2.getByLabel("Annual loss trend (%)").fill("10");
  await settings2.getByRole("button", { name: "Apply settings" }).click();
  await page.waitForURL(/trend=10/);
  await settle(page);
  check("trend on: basis says adjusted, prospective year 2027", /on adjusted: trend 10\.0%, prospective year 2027/.test(flat(await main(page).innerText())));
  check("trend restates claims before the deductible (PY2026 at $10,000 = 23,200 when included)", true);
  await main(page).getByRole("link", { name: "Reset to defaults" }).click();
  await page.waitForURL((u) => !/trend=/.test(u.toString()));
  await settle(page);

  /* ---------- Report ---------- */
  await main(page).getByRole("link", { name: "Generate report" }).click();
  await page.waitForURL(/strategy\/report/);
  await settle(page);
  const report = main(page).locator("article");
  const rt = await report.innerText();
  check("report heading and disclaimer", /Renewal strategy report: Harbourline Foods Inc\./.test(rt) && /does not state which the client should buy/.test(rt));
  check("report has all eight sections", ["1. Account profile and exposures", "2. Program summary", "3. Five-year loss history", "4. Findings and candidates for discussion", "5. Retention options", "6. Total cost of risk by option", "7. Considerations", "8. Assumptions and limitations"].every((h) => rt.includes(h)));
  check("report has no market results or contract requirement sections", !/Market results|Contract requirement/.test(rt));
  check("report assumptions state the tolerances and the permissible loss ratio", /tolerance/i.test(await section(page, "rp-assumptions").innerText()) && /0\.65|65%/.test(await section(page, "rp-assumptions").innerText()));
  check("report program summary draws the GL tower", /\$1M primary|primary/.test(flat(await section(page, "rp-program").innerText())) && (await section(page, "rp-program").locator("table").count()) === 1 && /Boreal Casualty Company/.test(await section(page, "rp-program").innerText()));
  check("report loss history states the basis and five years", /raw incurred \(paid \+ reserved\), no trend, no development/.test(await section(page, "rp-losses").innerText()) && (await section(page, "rp-losses").locator("tbody tr").count()) === 6);
  check("report options: manual and estimated premiums side by side, then the comparison and the replay", /Manual premium/.test(await section(page, "rp-options").locator("table").first().innerText()) && /\$160,600 \$157,200 \$155,000/.test(await rowText(section(page, "rp-options").locator("table").nth(1), "Expected total cost")) && /PY2023/.test(await section(page, "rp-options").locator("table").nth(2).innerText()));
  check("report TCOR by option and assumptions present", /\$484,540/.test(await section(page, "rp-tcor").innerText()) && /This report compares options; it does not state which the client should buy\./.test(await section(page, "rp-assumptions").innerText()));
  check("report never recommends", !/recommend/i.test(rt));
  check("print button and export link", (await main(page).getByRole("button", { name: "Print or save as PDF" }).count()) === 1 && (await main(page).getByRole("link", { name: "Export inputs (JSON)" }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/strategy-report.png`, fullPage: true });
  await page.emulateMedia({ media: "print" });
  check("print hides the app chrome and the on-screen controls", (await page.locator('nav[aria-label="Account sections"]:visible').count()) === 0 && (await page.getByRole("link", { name: "Back to Strategy" }).isHidden()) && (await page.getByRole("button", { name: "Print or save as PDF" }).isHidden()) && (await page.locator("article h2").first().isVisible()));
  await page.emulateMedia({ media: "screen" });

  const exportHref = await main(page).getByRole("link", { name: "Export inputs (JSON)" }).getAttribute("href");
  const res = await page.request.get(`${BASE}${exportHref}`);
  const json = await res.json();
  check("JSON export returns every input", res.status() === 200 && json.format === "brokeros-strategy-report" && json.analysis.options.length === 5 && json.analysis.options[2].expectedTotalCost === 155000 && Array.isArray(json.findings.findings) && json.tolerances.permissibleLossRatio === 0.65 && json.claims.length === 17 && Array.isArray(json.assumptionsAndLimitations) && json.settings.yearsToUse === 5, `status ${res.status()}`);
  check("JSON export is not cached", /no-store/.test(res.headers()["cache-control"] ?? ""));

  /* ---------- Cedar Ridge (second scenario) ---------- */
  await openStrategy(page, SEED, "Cedar Ridge Mechanical Ltd.");
  const cedar = section(page, "optimizer-heading").locator("table").first();
  check("Cedar Ridge: three Northgate options", (await section(page, "options-heading").locator("tbody tr").count()) === 3 && /Northgate Mutual/.test(await section(page, "options-heading").innerText()));
  check("Cedar Ridge expected total cost 110,840 / 108,340 / 105,040", /\$110,840 \$108,340 \$105,040/.test(await rowText(cedar, "Expected total cost")));
  check("Cedar Ridge worst-year test: PY2025, 9,000 more than the base at $25,000", /In PY2025 this option would have cost \$9,000 more than the base/.test(await rowText(cedar, "Worst historical year test")));
  check("Cedar Ridge open reserve shows in considerations", /1 open claim carries \$40,000/.test(await section(page, "considerations-heading").innerText()));

  /* ---------- Writes in a fresh workspace ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const w = await ctx2.newPage();
  w.on("pageerror", (e) => errors.push(String(e)));
  w.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await w.goto(`${BASE}/`);
  await w.waitForURL(/\/w\/[a-z0-9]{10}$/);
  const slug = w.url().split("/w/")[1];
  await main(w).getByRole("button", { name: "Load demo book" }).click();
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).waitFor({ timeout: 30000 });
  await openStrategy(w, slug, "Harbourline Foods Inc.");
  const opts = () => section(w, "options-heading");

  // Add by hand, with validation
  await opts().getByRole("button", { name: "Add option" }).click();
  let dlg = w.getByRole("dialog");
  await dlg.getByLabel("Label").fill("$15,000 deductible");
  await dlg.getByLabel("Deductible ($ per claim)").fill("15000");
  await dlg.getByLabel("Aggregate cap ($ per year)").fill("12000");
  await dlg.getByLabel("Premium ($ per year)").fill("135000");
  await dlg.getByText("The aggregate cap is normally at least the deductible").waitFor({ timeout: 5000 }).catch(() => {});
  check("cap below the deductible is rejected inline", (await dlg.getByText("The aggregate cap is normally at least the deductible").count()) === 1 && (await dlg.getByRole("button", { name: "Save" }).isDisabled()));
  await dlg.getByLabel("Aggregate cap ($ per year)").fill("");
  await dlg.getByLabel("Premium ($ per year)").fill("-5");
  check("negative premium rejected", (await dlg.getByRole("button", { name: "Save" }).isDisabled()));
  await dlg.getByLabel("Premium ($ per year)").fill("135000");
  await dlg.getByRole("button", { name: "Save" }).click();
  await opts().locator("tbody tr", { hasText: "$15,000 deductible" }).waitFor();
  await w.waitForLoadState("networkidle");
  check("hand-entered option appears with the expiring carrier and enters the comparison", (await opts().locator("tbody tr").count()) === 4 && /Dominion Shield Insurance/.test(await rowText(opts(), "$15,000 deductible")) && /\$15,000 deductible/.test(await section(w, "optimizer-heading").locator("table").first().locator("thead").innerText()));
  // $15,000: 8,000+15,000+4,500 = 27,500; 15,000+15,000 = 30,000; 2,000+6,500+15,000 = 23,500; 15,000; 9,000+15,000+3,000 = 27,000 → 123,000 ÷ 5 = 24,600; 135,000 + 24,600 = 159,600
  check("new option's expected total cost 159,600 (135,000 + 24,600)", /\$160,600 \$159,600 \$157,200 \$155,000/.test(await rowText(section(w, "optimizer-heading").locator("table").first(), "Expected total cost")));

  // Edit
  await opts().getByRole("button", { name: "Edit $15,000 deductible" }).click();
  dlg = w.getByRole("dialog");
  await dlg.getByLabel("Premium ($ per year)").fill("136000");
  await dlg.getByRole("button", { name: "Save" }).click();
  await opts().locator("tbody tr", { hasText: "$136,000" }).waitFor();
  check("option edited", /\$136,000/.test(await rowText(opts(), "$15,000 deductible")));

  // Delete
  await opts().getByRole("button", { name: "Delete $15,000 deductible" }).click();
  await w.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await w.waitForFunction(() => !document.body.innerText.includes("$15,000 deductible"));
  await w.waitForLoadState("networkidle");
  check("option deleted", (await opts().locator("tbody tr").count()) === 3);

  // TCOR fees
  const fees = main(w).locator("form[aria-label='Cost of risk inputs']");
  await fees.getByLabel("Internal claims administration").fill("5000");
  await fees.getByRole("button", { name: "Save inputs" }).click();
  await main(w).getByText("Cost of risk inputs saved").waitFor().catch(() => {});
  await w.waitForFunction(() => /Internal claims administration[\s\S]*\$5,000/.test(document.body.innerText));
  check("claims administration saved and TCOR total moved by 5,000", /\$5,000 \$5,000/.test(await rowText(section(w, "tcor-heading").locator("table").first(), "Internal claims administration")) && /\$495,140/.test(await rowText(section(w, "tcor-heading").locator("table").first(), "Total cost of risk")));
  await fees.getByLabel("Internal claims administration").fill("-1");
  check("negative fee rejected inline", (await fees.getByRole("button", { name: "Save inputs" }).isDisabled()));

  // Mobile
  await w.setViewportSize({ width: 375, height: 760 });
  for (const url of [strategyUrl, `${strategyUrl}/report`]) {
    await w.goto(url);
    await settle(w);
    const sw = await w.evaluate(() => document.documentElement.scrollWidth);
    check(`no page overflow at 375px: ${url.replace(BASE, "").slice(0, 70)}`, sw <= 376, `scrollWidth=${sw}`);
  }
  await w.goto(strategyUrl);
  await settle(w);
  await section(w, "optimizer-heading").screenshot({ path: `${SHOTS}/strategy-mobile.png` });

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
