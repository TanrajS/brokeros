/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v1.1 Marketing (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-marketing.cjs
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
const section = (p, id) => main(p).locator(`section[aria-labelledby='${id}']`);
const flat = (s) => s.replace(/\s+/g, " ");

async function openMarketing(p, slug, account) {
  await p.goto(`${BASE}/w/${slug}`);
  await settle(p);
  await main(p).getByRole("link", { name: account, exact: true }).click();
  await p.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  await p.goto(`${p.url()}/marketing`);
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
  await openMarketing(page, SEED, "Harbourline Foods Inc.");
  const marketingUrl = page.url();
  check("Marketing tab defaults to the GL renewal", /General Liability · Dominion Shield Insurance/.test(await main(page).getByRole("navigation", { name: "Policy being marketed" }).locator('a[aria-current="page"]').innerText()));
  check("submission package shows checklist progress", /of \d ready|Ready to market/.test(await section(page, "package-heading").innerText()));
  const carriers = flat(await section(page, "carriers-heading").innerText());
  check("five carriers approached with statuses", (await section(page, "carriers-heading").locator(":scope > ul > li").count()) === 5 && /Declined/.test(carriers) && /Submitted/.test(carriers));
  check("Tidewater waiting 14 days, Maplewood declined for class of business", /Tidewater Assurance \(fictional\) Submitted Sent .* waiting 14 days/.test(carriers) && /declined: Class of business/.test(carriers));

  const cmp = section(page, "compare-heading");
  const heads = await cmp.locator("thead th").allInnerTexts();
  check("comparison: expiring first, then three quotes", heads.length === 5 && /Expiring/.test(heads[1]), heads.map(flat).join(" | "));
  const summary = flat(await cmp.locator("tbody tr").first().innerText());
  check("premium changes −5.3% (Pacific Crest) and −14.7% (Ironwood)", /\$142,000 −5\.3%/.test(summary) && /\$128,000 −14\.7%/.test(summary), summary);
  check("Ironwood 5 of 7 terms; Pacific Crest 7 of 7", /\$128,000 −14\.7% commission \$12,800 5 of 7 terms match/.test(summary) && /\$142,000 −5\.3% commission \$21,300 7 of 7 terms match/.test(summary));
  const mismatchRow = flat(await cmp.locator("tbody tr", { hasText: "Mismatches" }).innerText());
  check("mismatches spelled out", /Deductible higher by \$15,000 \(\$25,000 vs \$10,000\): more retained risk/.test(mismatchRow) && /Waiver of subrogation missing/.test(mismatchRow));
  check("commission shown beside client cost", (await cmp.locator("tbody tr", { hasText: "Broker commission" }).count()) === 1 && (await cmp.locator("tbody tr", { hasText: "Client cost" }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/marketing-compare.png`, fullPage: true });

  // Sort by commission: Pacific Crest (21,300) first
  await cmp.getByRole("link", { name: /^Commission/ }).click();
  await page.waitForURL(/sort=commission/);
  await settle(page);
  check("sorting by commission puts Pacific Crest first", /Pacific Crest/.test(await section(page, "compare-heading").locator("thead th").nth(2).innerText()));

  // Normalise
  await section(page, "compare-heading").getByRole("link", { name: "Normalise" }).click();
  await page.waitForURL(/normalise=1/);
  await settle(page);
  const note = flat(await section(page, "compare-heading").getByRole("status").innerText());
  check("Normalise shows 2 of 3 and says Ironwood was excluded and why", /Showing 2 of 3 quotes/.test(note) && /Ironwood Specialty \(fictional\) \(Deductible higher by \$15,000/.test(note), note);
  check("Normalise table drops Ironwood", (await section(page, "compare-heading").locator("thead th", { hasText: "Ironwood" }).count()) === 0);

  // Target: the Westbay contract requirement for GL
  await page.goto(marketingUrl);
  await settle(page);
  await section(page, "compare-heading").getByRole("link", { name: /Westbay Grocers \(fictional\): General Liability/ }).click();
  await page.waitForURL(/target=/);
  await settle(page);
  const reqSummary = flat(await section(page, "compare-heading").locator("tbody tr").first().innerText());
  // 2 limits + 3 required endorsements = 5; Pacific Crest 1M/2M is below 2M/4M → 3 of 5
  check("contract target counts 5 terms; Pacific Crest 3 of 5", /\$142,000 −5\.3% commission \$21,300 3 of 5 terms match/.test(reqSummary), reqSummary);

  // Printable summary
  await page.goto(marketingUrl);
  await settle(page);
  await section(page, "package-heading").getByRole("link", { name: "Submission summary" }).click();
  await page.waitForURL(/\/marketing\/summary/);
  await settle(page);
  const sumText = flat(await main(page).innerText());
  check("summary has profile, exposure, expiring terms, five-year losses and target", /Account profile/.test(sumText) && /Exposure and expiring terms/.test(sumText) && /Five-year loss summary/.test(sumText) && /5-year total \(PY2022–PY2026\) 12 2 \$305,000/.test(sumText) && /Target terms/.test(sumText));
  await page.emulateMedia({ media: "print" });
  check("print view hides the app chrome", !(await page.locator("header").first().isVisible()) && !(await main(page).getByRole("button", { name: /Print/ }).isVisible()));
  await page.screenshot({ path: `${SHOTS}/marketing-summary-print.png`, fullPage: true });
  await page.emulateMedia({ media: "screen" });

  // Market log
  await page.goto(`${BASE}/w/${SEED}/market-log`);
  await settle(page);
  const maplewood = flat(await main(page).locator("tr", { hasText: "Maplewood" }).innerText());
  check("market log flags Maplewood: 4 sent, no quotes", /4 sent, no quotes/.test(maplewood) && /Class of business 1/.test(maplewood), maplewood);
  check("Ironwood hit 100.0%, bind 0.0%", /Ironwood Specialty \(fictional\) 2 2 0 0 100\.0% 0\.0%/.test(flat(await main(page).locator("tr", { hasText: "Ironwood" }).innerText())));
  await page.goto(`${BASE}/w/${SEED}/dashboard`);
  await settle(page);
  check("Dashboard has the market log card", (await section(page, "market-heading").locator("tbody tr").count()) >= 5);

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
  await openMarketing(w, slug, "Harbourline Foods Inc.");
  const wPolicyHref = `${BASE}${await main(w).getByRole("navigation", { name: "Policy being marketed" }).locator('a[aria-current="page"]').getAttribute("href")}`;
  const carriersSec = () => section(w, "carriers-heading");

  // Planned carrier: no quote button until submitted
  await carriersSec().getByRole("button", { name: "Add carrier" }).click();
  let dlg = w.getByRole("dialog");
  await dlg.getByLabel("Carrier").fill("Northlight Mutual (fictional)");
  await dlg.getByLabel("Sent on").fill("");
  await dlg.getByRole("button", { name: "Save" }).click();
  const planned = carriersSec().locator(":scope > ul > li", { hasText: "Northlight Mutual" });
  await planned.getByText("Planned", { exact: true }).waitFor();
  check("planned carrier cannot take a quote yet", (await planned.getByRole("button", { name: "Record quote" }).count()) === 0);
  await planned.getByRole("button", { name: "Mark submitted" }).click();
  dlg = w.getByRole("dialog");
  check("marking submitted asks for the sent date", (await dlg.getByLabel("Sent on").count()) === 1);
  await w.waitForFunction(() => document.querySelector("#sub-sent") !== null);
  await dlg.getByLabel("Sent on").fill(await w.evaluate(() => document.querySelector("#sub-sent").max));
  await dlg.getByRole("button", { name: "Save" }).click();
  await planned.getByText("Submitted", { exact: true }).waitFor();
  check("planned → submitted with a sent date", true);

  // Record an expired quote on it → flagged, cannot bind
  await planned.getByRole("button", { name: "Record quote" }).click();
  dlg = w.getByRole("dialog");
  await dlg.getByLabel("Quoted premium (CAD)").fill("139,000");
  await dlg.getByLabel("Valid until").fill("2020-01-01");
  await dlg.getByRole("button", { name: "Save quote" }).click();
  await planned.getByText("Expired", { exact: true }).waitFor();
  check("expired quote flagged and its Bind disabled", await planned.getByRole("button", { name: "Bind" }).isDisabled());

  // Bind Pacific Crest → outcome prefilled
  const pacific = carriersSec().locator(":scope > ul > li", { hasText: "Pacific Crest" });
  await pacific.getByRole("button", { name: "Bind" }).click();
  await w.waitForURL(/\/policies\/[0-9a-f-]{36}\?outcome=renewed/);
  await w.getByRole("dialog").getByText(/Prefilled from the quote bound with Pacific Crest/).waitFor();
  const odlg = w.getByRole("dialog");
  check("Renewed form prefilled with the bound quote", (await odlg.getByLabel("Renewal carrier").inputValue()) === "Pacific Crest Insurance (fictional)" && (await odlg.getByLabel("Renewal premium (CAD)").inputValue()) === "142000" && (await odlg.getByLabel("Renewal exposure amount").inputValue()) === "26000000");
  await odlg.getByRole("button", { name: "Record renewed" }).click();
  await main(w).getByText("This term vs its renewal").waitFor();
  check("renewal recorded with the new carrier", (await main(w).getByText(/renewed with Pacific Crest Insurance \(fictional\) at \$142,000|General Liability · Pacific Crest Insurance \(fictional\)/).count()) >= 1);

  await w.goto(wPolicyHref);
  await settle(w);
  const pacific2 = section(w, "carriers-heading").locator(":scope > ul > li", { hasText: "Pacific Crest" });
  check("Pacific Crest shows Bound; Unbind blocked once the outcome exists", (await pacific2.getByText("Bound", { exact: true }).count()) >= 1 && (await pacific2.getByRole("button", { name: "Unbind" }).isDisabled()));
  check("other quotes can no longer be bound", (await section(w, "carriers-heading").getByRole("button", { name: "Bind", exact: true }).count()) === 0);

  // Mobile
  await w.setViewportSize({ width: 375, height: 760 });
  for (const url of [`${BASE}/w/${SEED}/market-log`, marketingUrl.replace(BASE, BASE)]) {
    await w.goto(url);
    await settle(w);
    const sw = await w.evaluate(() => document.documentElement.scrollWidth);
    check(`no page overflow at 375px: ${url.replace(BASE, "").slice(0, 60)}`, sw <= 376, `scrollWidth=${sw}`);
  }
  await section(w, "compare-heading").screenshot({ path: `${SHOTS}/marketing-mobile.png` });

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
