/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v0.3 Dashboard (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-dashboard.cjs
 * Read-only against the seeded workspace; creates one empty workspace for the empty state.
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
const tile = (p, label) => main(p).locator("div.rounded-lg.border", { has: p.locator(`h3:text-is("${label}")`) });

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/w/${SEED}/dashboard`);
  await settle(page);

  // Windows printed
  check("lookback window dates printed", (await main(page).getByText("13 Nov 2025 to 12 Nov 2026, trailing 12 months").count()) === 1);
  check("forward window dates printed", (await main(page).getByText("13 Nov 2026 to 12 Nov 2027, next 12 months").count()) === 1);

  // Retention tiles
  const prem = await tile(page, "Premium retention").innerText();
  check("premium retention 87.5% with numerator and denominator", /87\.5%/.test(prem) && /\$1,085,000 renewed ÷ \$1,240,000/.test(prem));
  const cnt = await tile(page, "Count retention").innerText();
  check("count retention 80.0% = 8 ÷ 10", /80\.0%/.test(cnt) && /8 renewed ÷ 10 resolved/.test(cnt));
  check("renewed premium ratio says it can exceed 100%", /Can exceed 100% when rates rise/.test(await tile(page, "Renewed premium ratio").innerText()));
  check("excluded not-yet-expired count shown", (await main(page).getByText(/Excluded: 1 policy has an outcome but has not expired yet/).count()) === 1);
  const lost = await main(page).locator("section[aria-labelledby='retention-heading'] tbody tr").allInnerTexts();
  check("lost business table has the loss and the non-renewal", lost.length === 2 && lost.some((t) => /Prairie Loop/.test(t) && /Lost: Price/.test(t) && /\$49,500/.test(t)) && lost.some((t) => /Non-renewed by carrier/.test(t)));

  // Book tiles
  check("in-force premium tile", /\$4,988,300/.test(await tile(page, "In-force premium").innerText()));
  check("average rate labelled premium-weighted", /Premium-weighted/.test(await tile(page, "Average commission rate").innerText()));
  await tile(page, "Booked commission").getByText("Show the math").click();
  check("show the math lists per-policy commission", (await tile(page, "Booked commission").getByText(/^Commission 1: /).count()) === 1);

  // Concentration flag
  check("carrier concentration flag shown neutrally", (await main(page).getByText(/Dominion Shield Insurance holds 43\.1% of in-force premium/).count()) === 1 && (await main(page).getByText(/not a verdict/).count()) === 1);

  // Forecast defaults + disclaimer
  check("projection disclaimer printed", (await main(page).getByText("A projection from the assumptions above, not a prediction.").count()) === 1);
  check("assumed retention defaults to 87.5", (await main(page).getByLabel("Assumed retention (%)").inputValue()) === "87.5");
  const baseBefore = await tile(page, "Base forecast commission").locator("p").first().innerText();

  // Invalid assumption disables Apply
  await main(page).getByLabel("Assumed retention (%)").fill("120");
  await main(page).getByRole("alert").filter({ hasText: "cannot exceed 100%" }).waitFor();
  check("invalid retention disables Apply", await main(page).getByRole("button", { name: "Apply assumptions" }).isDisabled());
  await main(page).getByLabel("Assumed retention (%)").fill("90");
  await main(page).getByLabel("Assumed rate change (%)").fill("5");
  await main(page).getByRole("button", { name: "Apply assumptions" }).click();
  await page.waitForURL(/retention=90&rate=5/);
  await settle(page);
  const baseAfter = await tile(page, "Base forecast commission").locator("p").first().innerText();
  check("assumptions persist in the URL and change the forecast", baseAfter !== baseBefore, `${baseBefore} → ${baseAfter}`);
  check("high retention capped at 100%", /Retention 100\.0%/.test(await tile(page, "High forecast commission").innerText()));

  // Producer view
  await main(page).getByLabel("Producer").selectOption("Dana Whitfield");
  await main(page).getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForURL(/producer=Dana/);
  await settle(page);
  const url = page.url();
  check("producer line shown", (await main(page).getByText(/^Showing \d+ of 19 accounts \(producer: Dana Whitfield\)\.$/).count()) === 1);
  check("filters keep assumptions and stay clean", url.includes("retention=90") && !url.includes("lookback="), url.replace(BASE, ""));

  // Lookback switch reprints the window
  await page.goto(`${BASE}/w/${SEED}/dashboard?lookback=6&forward=3`);
  await settle(page);
  check("6-month lookback window", (await main(page).getByText("13 May 2026 to 12 Nov 2026, trailing 6 months").count()) === 1);
  check("3-month forward window", (await main(page).getByText("13 Nov 2026 to 12 Feb 2027, next 3 months").count()) === 1);
  check("selects reflect the URL", (await main(page).getByLabel("Lookback (retention)").inputValue()) === "6");

  // Chart: bars render; bar click opens Renewals filtered to that month
  await page.goto(`${BASE}/w/${SEED}/dashboard`);
  await settle(page);
  const bars = main(page).locator(".recharts-bar-rectangle path");
  await bars.first().waitFor();
  const barCount = await bars.count();
  check("chart renders bars", barCount >= 8, `${barCount} bars`);
  await page.screenshot({ path: `${SHOTS}/dashboard-desktop.png`, fullPage: true });
  await bars.nth(1).click();
  await page.waitForURL(/\/renewals\?/);
  await settle(page);
  const rurl = page.url();
  check("bar click opens Renewals filtered to the month, open only", /month=\d{4}-\d{2}/.test(rurl) && rurl.includes("open=1") && rurl.includes("view=list"), rurl.replace(BASE, ""));
  check("Renewals explains the month filter", (await main(page).getByText(/Showing open policies expiring in/).count()) === 1);

  // Table link equivalent
  await page.goto(`${BASE}/w/${SEED}/dashboard`);
  await settle(page);
  const firstMonthLink = main(page).locator("section[aria-labelledby='expiring-heading'] tbody a").first();
  const label = await firstMonthLink.innerText();
  await firstMonthLink.click();
  await page.waitForURL(/month=/);
  check("table month link reaches the same filter", true, label);

  // Empty workspace
  const ctx2 = await browser.newContext();
  const e = await ctx2.newPage();
  e.on("pageerror", (x) => errors.push(String(x)));
  await e.goto(`${BASE}/`);
  await e.waitForURL(/\/w\/[a-z0-9]{10}$/);
  await e.goto(e.url() + "/dashboard");
  await settle(e);
  const html = await main(e).innerText();
  check("empty workspace shows a prompt", /no policies yet/.test(html));
  check("empty tiles show em dashes, never NaN", !/NaN|undefined|Infinity/.test(html) && (await main(e).locator('[aria-label$="not entered"]').count()) >= 5);
  await ctx2.close();

  // Mobile
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(`${BASE}/w/${SEED}/dashboard`);
  await settle(page);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check("no page overflow at 375px", sw <= 376, `scrollWidth=${sw}`);
  const chartW = await main(page).locator(".recharts-wrapper").first().evaluate((el) => el.getBoundingClientRect().width);
  check("chart fits the phone width", chartW > 250 && chartW <= 360, `${Math.round(chartW)}px`);
  await main(page).locator("section[aria-labelledby='expiring-heading']").screenshot({ path: `${SHOTS}/dashboard-mobile-chart.png` });

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
