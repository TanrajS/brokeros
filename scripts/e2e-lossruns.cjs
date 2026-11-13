/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v0.4 Loss Runs (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-lossruns.cjs
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
  await main(p).locator("h1").first().waitFor();
  await p.waitForLoadState("networkidle");
}
const summaryRow = (p, label) => main(p).locator("section[aria-labelledby='summary-heading'] tbody tr", { hasText: label });

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  /* ---------- Read-only: seeded Harbourline ---------- */
  await page.goto(`${BASE}/w/${SEED}/placement`);
  await settle(page);
  await main(page).getByRole("link", { name: "Harbourline Foods Inc." }).click();
  await page.waitForURL(/\/placement\/[0-9a-f-]{36}\/loss-runs$/);
  await settle(page);
  const harbourUrl = page.url();
  check("picker opens the Loss Runs tab", (await main(page).getByRole("link", { name: "Loss Runs", exact: true }).getAttribute("aria-current")) === "page");
  check("tabs show Program v0.5, Marketing v0.6, Strategy v0.7", (await main(page).getByRole("navigation", { name: "Placement sections" }).innerText()).replace(/\s+/g, " ").includes("Program Marketing v0.6 Strategy v0.7"));

  const py23 = (await summaryRow(page, "PY2023").innerText()).replace(/\s+/g, " ");
  check("PY2023 incurred $135,000", py23.includes("$135,000"), py23);
  check("PY2023 loss ratio 96.4%, severity $67,500, frequency 0.08", py23.includes("96.4%") && py23.includes("$67,500") && py23.includes("0.08"));
  check("frequency basis labelled", (await main(page).getByRole("columnheader", { name: "Frequency (per $1M of revenue)" }).count()) === 1);
  check("running year earned to date", (await summaryRow(page, "PY2026").innerText()).includes("earned to date"));
  const total = (await main(page).locator("section[aria-labelledby='summary-heading'] tfoot tr").first().innerText()).replace(/\s+/g, " ");
  check("five-year total 12 claims and $305,000", total.startsWith("5-year total (PY2022–PY2026) 12 2") && total.includes("$305,000"), total);
  check("chart renders 5 bars and a loss-ratio line", (await main(page).locator(".recharts-bar-rectangle").count()) === 5 && (await main(page).locator(".recharts-line-curve").count()) === 1);
  check("basis badge says raw", (await main(page).getByText("Active basis: raw").count()) === 1);
  check("large losses: 4 at or above $25,000", (await main(page).locator("section[aria-labelledby='large-heading'] tbody tr").count()) === 4);
  check("open claims: 2 with $138,000 reserves", (await main(page).getByText(/^2 open claims carrying \$138,000 in reserves/).count()) === 1);
  check("data quality: nothing flagged", (await main(page).getByText("No claims on this account are flagged.").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/lossruns-raw.png`, fullPage: true });

  // Trend + development
  await main(page).getByLabel("Apply loss trend").check();
  await main(page).getByLabel("Annual loss trend (%)").fill("5");
  await main(page).getByLabel("Apply loss development").check();
  await main(page).getByLabel("12 months").fill("1.15");
  await main(page).getByRole("button", { name: "Apply settings" }).click();
  await page.waitForURL(/trend=5/);
  await settle(page);
  check("settings persist in the URL", page.url().includes("ldf=1.15") && page.url().includes("trend=5"), page.url().replace(BASE, ""));
  check("basis badge shows adjusted", (await main(page).getByText(/Active basis: adjusted: trend 5\.0% \+ development/).count()) === 1);
  const py26adj = (await summaryRow(page, "PY2026").innerText()).replace(/\s+/g, " ");
  // PY2026: 30,000 × 1.05 (exponent 1) × 1.15 (age 10 → 12) = 36,225
  check("PY2026 adjusted = 30,000 × 1.05 × 1.15 = $36,225", py26adj.includes("$36,225") && py26adj.includes("exponent 1"), py26adj);
  const py22adj = (await summaryRow(page, "PY2022").innerText()).replace(/\s+/g, " ");
  // PY2022: 44,500 × 1.05^5 = 44,500 × 1.2762816 = 56,794.53 → $56,795; age 58 → 48 → factor 1.00
  check("PY2022 trended over 5 years (age 48 bucket)", py22adj.includes("exponent 5") && py22adj.includes("$56,795") && py22adj.includes("58 mo → 48"), py22adj);
  check("factors stated as entered, not calculated", (await main(page).getByText(/come from the carrier or an actuary and are entered here, not calculated/).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/lossruns-adjusted.png`, fullPage: true });

  // Placeholders
  await main(page).getByRole("link", { name: /Program/ }).click();
  await page.waitForURL(/\/program$/);
  await settle(page);
  check("Program tab opens the tower", (await main(page).getByRole("heading", { name: /^Tower:/ }).count()) === 1);

  /* ---------- Writes: a fresh workspace with the demo book ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const w = await ctx2.newPage();
  w.on("pageerror", (e) => errors.push(String(e)));
  w.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await w.goto(`${BASE}/`);
  await w.waitForURL(/\/w\/[a-z0-9]{10}$/);
  const slug = w.url().split("/w/")[1];
  await main(w).getByRole("button", { name: "Load demo book" }).click();
  await main(w).getByRole("link", { name: "Cedar Ridge Mechanical Ltd." }).waitFor({ timeout: 30000 });
  await w.goto(`${BASE}/w/${slug}/placement`);
  await settle(w);
  await main(w).getByRole("link", { name: "Cedar Ridge Mechanical Ltd." }).click();
  await w.waitForURL(/loss-runs$/);
  await settle(w);
  const cedarUrl = w.url();
  check("Cedar Ridge: 3 claims over five years", (await main(w).locator("section[aria-labelledby='summary-heading'] tfoot tr").first().innerText()).replace(/\s+/g, " ").includes(" 3 1 "));

  // Add claim: validation
  await main(w).getByRole("button", { name: "Add claim" }).click();
  const dlg = w.getByRole("dialog");
  await dlg.getByLabel("Claim number").fill("NGM-GL-24-0288"); // duplicate of an existing number
  await dlg.getByText("Already used on this account").waitFor();
  check("duplicate claim number warned live", true);
  await dlg.getByLabel("Claim number").fill("NGM-GL-26-0100");
  await dlg.getByLabel("Date of loss").fill("2026-06-10");
  await dlg.getByLabel("Date reported").fill("2026-06-01");
  await dlg.getByRole("alert").filter({ hasText: "on or after the date of loss" }).waitFor();
  check("reported before loss rejected", await dlg.getByRole("button", { name: "Save claim" }).isDisabled());
  await dlg.getByLabel("Date reported").fill("2026-06-12");
  await dlg.getByLabel("Paid (CAD)").fill("7,500");
  await dlg.getByLabel("Reserved (CAD)").fill("2,000");
  await dlg.locator("#claim-status").selectOption("closed");
  await dlg.getByText(/closed but still carries a reserve/).waitFor();
  check("closed with reserve asks for confirmation", await dlg.getByRole("button", { name: "Save claim" }).isDisabled());
  await dlg.getByLabel("Yes, save it closed with a reserve").check();
  await dlg.getByLabel("Description").fill("Ceiling tile dislodged during duct work struck a client employee.");
  await dlg.getByRole("button", { name: "Save claim" }).click();
  await main(w).getByRole("cell", { name: /^NGM-GL-26-0100/ }).first().waitFor();
  check("claim saved and listed", true);
  check("closed-with-reserve claim flagged in data quality", (await main(w).locator("section[aria-labelledby='quality-heading']").getByText("Closed with a reserve").count()) === 1);

  // CSV import: 25 rows, 2 invalid
  const header = "status,claim_number,line,date_of_loss,date_reported,description,paid,reserved";
  const rows = [];
  for (let i = 1; i <= 23; i++) rows.push(`closed,IMP-${String(i).padStart(3, "0")},GL,2025-0${(i % 9) + 1}-1${i % 9},2025-0${(i % 9) + 1}-2${i % 9},Imported claim ${i},"1,${i}00",0`);
  rows.push("closed,IMP-024,General Liability,,2025-05-02,Missing loss date,500,0");
  rows.push("open,IMP-025,General Liability,2025-05-01,2025-05-02,Bad amount,abc,100");
  const csv = [header, ...rows].join("\n");
  await main(w).getByRole("button", { name: "Import CSV" }).click();
  const idlg = w.getByRole("dialog");
  await idlg.getByLabel("Loss run file (.csv)").setInputFiles({ name: "loss-run.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await idlg.getByText(/23<\/strong>|23 of 25 rows valid/).first().waitFor().catch(() => {});
  const status = await idlg.getByRole("status").first().innerText();
  check("preview marks 23 of 25 valid", /23 of 25 rows valid/.test(status), status);
  const invalidText = await idlg.locator("tbody tr", { hasText: "Invalid" }).allInnerTexts();
  check("invalid rows give reasons", invalidText.length === 2 && invalidText.some((t) => /missing date of loss/.test(t)) && invalidText.some((t) => /non-numeric paid amount/.test(t)));
  await idlg.getByRole("button", { name: "Import 23 valid rows" }).click();
  await idlg.getByText("Imported 23 of 25 rows; 2 skipped.").waitFor();
  const skippedList = await idlg.locator("li").allInnerTexts();
  check("result lists the skipped rows", skippedList.length === 2 && /Row 24 \(IMP-024\)/.test(skippedList.join(" ")), skippedList.join(" | "));
  await idlg.getByRole("button", { name: "Done" }).click();
  await w.reload();
  await settle(w);
  const imported = await main(w).locator("section[aria-labelledby='claims-heading'] tbody tr", { hasText: "IMP-" }).count();
  check("23 imported claims listed", imported === 23, `${imported}`);
  check("imported claims outside Cedar's GL periods? none (dates inside PY2024/PY2025)", (await main(w).locator("section[aria-labelledby='quality-heading']").getByText("Outside known policy periods").count()) === 0);

  // Re-importing the same file: every row now a duplicate → nothing to import
  await main(w).getByRole("button", { name: "Import CSV" }).click();
  await w.getByRole("dialog").getByLabel("Loss run file (.csv)").setInputFiles({ name: "loss-run.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await w.getByRole("dialog").getByText(/0 of 25 rows valid/).waitFor();
  check("re-import flags every row as a duplicate", await w.getByRole("dialog").getByRole("button", { name: "Import 0 valid rows" }).isDisabled());
  await w.keyboard.press("Escape");

  // Mobile
  await w.setViewportSize({ width: 375, height: 760 });
  await w.goto(cedarUrl);
  await settle(w);
  const sw = await w.evaluate(() => document.documentElement.scrollWidth);
  check("no page overflow at 375px", sw <= 376, `scrollWidth=${sw}`);
  await main(w).locator("section[aria-labelledby='summary-heading']").screenshot({ path: `${SHOTS}/lossruns-mobile.png` });

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  void harbourUrl;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
