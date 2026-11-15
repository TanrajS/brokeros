/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v0.2 Renewals (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   npx -y playwright@1.56.1 install chromium
 *   SEED_SLUG=<slug from npm run db:seed with SEED_AS_OF=2026-11-12> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-renewals.cjs
 * Reads the seeded workspace without changing it; all mutations happen in a fresh workspace.
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
const main = (page) => page.locator("main:visible");

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await browser_();
  async function browser_() {
    return chromium.launch();
  }
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  /* ---------- Read-only checks on the seeded workspace ---------- */
  await page.goto(`${BASE}/w/${SEED}/renewals`);
  await main(page).getByRole("heading", { name: "Renewals" }).waitFor();
  const columns = await main(page).locator("section[aria-labelledby^='col-'] h2").allTextContents();
  check("board has 7 stage columns", columns.length === 7, columns.map((c) => c.replace(/\d+$/, "")).join(" | "));
  const strategy = main(page).locator("section[aria-labelledby='col-120-day-strategy']");
  check("Cedar Ridge GL sits in 120-day: Strategy", (await strategy.getByText("Cedar Ridge Mechanical Ltd.").count()) >= 1);
  const expired = main(page).locator("section[aria-labelledby='col-expired-action-required']");
  // v0.3 seed: every expired policy in the trailing year has an outcome, so Expired is empty.
  check("Expired column is empty in the v0.3 demo", (await expired.getByText("No policies").count()) === 1);
  check("summary strip shows overdue tasks = 3", (await main(page).getByText("Overdue tasks").locator("..").getByText("3", { exact: true }).count()) === 1);
  await main(page).getByText("Stage rules").click();
  check("stage rules panel lists the 91–120 rule", (await main(page).getByText("91 to 120 days to expiry, inclusive.").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/renewals-board.png`, fullPage: true });

  // Filters live in the URL
  await main(page).getByLabel("Stage", { exact: true }).selectOption("60-day: Quoting");
  await main(page).getByLabel("Line", { exact: true }).selectOption("General Liability");
  await main(page).getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL((u) => u.search.includes("stage=60-day"));
  await main(page).getByText("Harbourline Foods Inc.").first().waitFor();
  const url = page.url();
  check("filters are in a clean query string", url.includes("line=General+Liability") && url.includes("stage=60-day") && !url.includes("producer="), url.replace(BASE, ""));
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await main(p2).getByText("Harbourline Foods Inc.").first().waitFor();
  const cards = await main(p2).locator("section[aria-labelledby^='col-'] li").count();
  check("shared filtered link reproduces the view", cards === 1, `${cards} card(s)`);
  await p2.close();

  // List view sorted by days to expiry
  await page.goto(`${BASE}/w/${SEED}/renewals?view=list`);
  await main(page).getByRole("columnheader", { name: /Days to expiry/ }).waitFor();
  const firstAsc = await main(page).locator("tbody tr").first().locator("td").nth(5).innerText();
  await main(page).getByRole("link", { name: /Days to expiry/ }).click();
  await page.waitForURL(/dir=desc/);
  await main(page).locator("tbody tr").first().waitFor();
  const firstDesc = await main(page).locator("tbody tr").first().locator("td").nth(5).innerText();
  check("list sorts by days to expiry both ways", /^-\d{3,4} days/.test(firstAsc.trim()) && /4\d\d|3\d\d/.test(firstDesc), `${firstAsc.trim()} then ${firstDesc.trim()}`);

  // Cedar rate example on first load
  await page.goto(`${BASE}/w/${SEED}/renewals?view=list&stage=120-day%3A+Strategy`);
  await main(page).getByRole("link", { name: "Cedar Ridge Mechanical Ltd." }).first().click();
  await page.waitForURL(/\/policies\//);
  // Several Cedar policies are in Strategy; go to the GL one via the account page
  const accountLink = main(page).getByRole("link", { name: "Cedar Ridge Mechanical Ltd." });
  await accountLink.click();
  await main(page).getByRole("heading", { name: "Cedar Ridge Mechanical Ltd." }).waitFor();
  await main(page).locator("tr", { hasText: "General Liability" }).filter({ hasText: "120 days" }).getByRole("link", { name: "Northgate Mutual", exact: true }).click();
  await page.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await main(page).getByText("Premium rose 8.0% while exposure rose 15.0%, so the rate fell 6.1%.").waitFor();
  check("Cedar GL shows the rate-vs-exposure sentence", true);
  // v1: a hidden Property policy page (Activity) also has a "Show the math"; take the visible one in the rate panel
  await main(page).getByText("Show the math").filter({ visible: true }).first().click();
  check("math lists the rate division to four decimals", (await main(page).getByText("Rate change = 4.6957 ÷ 5.0000 − 1 = −0.0609").count()) === 1);
  check("checklist generated on first open", (await main(page).getByRole("checkbox", { name: "Five-year loss runs" }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/policy-cedar.png`, fullPage: true });

  /* ---------- Mutations in a fresh workspace ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const w = await ctx2.newPage();
  w.on("pageerror", (e) => errors.push(String(e)));
  w.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await w.goto(`${BASE}/`);
  await w.waitForURL(/\/w\/[a-z0-9]{10}$/);
  const slug = w.url().split("/w/")[1];
  await main(w).getByRole("button", { name: "Load demo book" }).click();
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).waitFor({ timeout: 30000 });

  // Harbourline GL policy page
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).click();
  await main(w).getByRole("heading", { name: "Harbourline Foods Inc." }).waitFor();
  const accountUrl = w.url();
  // v0.4: Harbourline has five GL policy years; take the current one (60 days out)
  await main(w).locator("tr", { hasText: "General Liability" }).filter({ hasText: "60 days" }).getByRole("link", { name: "Dominion Shield Insurance", exact: true }).click();
  await w.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  const policyUrl = w.url();

  // Checklist to 100%
  const boxes = main(w).locator("section[aria-labelledby='checklist-heading'] input[type=checkbox][id^='check-']");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const box = boxes.nth(i);
    if (!(await box.isChecked())) {
      await box.check();
      await w.waitForTimeout(300);
      await main(w).locator("section[aria-labelledby='checklist-heading'] input[type=checkbox][id^='check-']").nth(i).waitFor();
      await expectChecked(main(w).locator("section[aria-labelledby='checklist-heading'] input[type=checkbox][id^='check-']").nth(i));
    }
  }
  async function expectChecked(loc) {
    for (let t = 0; t < 40; t++) {
      if (await loc.isChecked()) return;
      await w.waitForTimeout(150);
    }
  }
  await main(w).getByText("Ready to market").first().waitFor();
  check("ticking every item shows Ready to market", true, `${n} items`);

  // Custom item drops readiness below 100%
  await main(w).getByLabel("Add a custom item").fill("Recall plan");
  await main(w).getByRole("button", { name: "Add item" }).click();
  await main(w).getByText(`${n} of ${n + 1} ready`).waitFor();
  check("custom item counts toward readiness", true, `${n} of ${n + 1} ready`);

  // Generate tasks: Harbourline GL already has the four standard tasks
  await main(w).getByRole("button", { name: "Generate standard renewal tasks" }).click();
  await w.getByText(/Created 0 tasks; skipped 2 already past the as-of date; skipped 2 already on this policy/).waitFor();
  check("generate reports created and skipped", true);

  // Record Renewed
  await main(w).getByRole("button", { name: "Record outcome" }).click();
  const dlg = w.getByRole("dialog");
  const recordBtn = dlg.getByRole("button", { name: "Record renewed" });
  check("Record renewed disabled until premium and exposure entered", await recordBtn.isDisabled());
  await dlg.getByLabel("Renewal premium (CAD)").fill("162,000");
  await dlg.getByLabel("Renewal exposure amount").fill("27,000,000");
  await dlg.getByText(/Premium rose 8\.0% while exposure rose 8\.0%, so the rate was unchanged\./).waitFor();
  check("live preview sentence in the renewed form", true);
  await recordBtn.click();
  await main(w).getByText("This term vs its renewal").waitFor();
  check("renewed creates a successor and shows the pair", (await main(w).getByRole("link", { name: /Open the renewal policy/ }).count()) === 1);
  check("old policy now Closed", (await main(w).getByText("Closed", { exact: true }).count()) >= 1);

  // Successor page: not_started, prior-term panel
  await main(w).getByRole("link", { name: "Open the renewal policy" }).click();
  // v0.4: the expiring policy has its own prior term, so wait for the URL, not the panel title
  await w.waitForURL((u) => u.toString() !== policyUrl);
  // Activity keeps the previous page hidden inside the same <main>; match only the visible panel
  await main(w).getByText("Prior term vs this term").filter({ visible: true }).waitFor();
  check("successor shows Not started and links back", (await main(w).getByText("Not started", { exact: true }).count()) >= 1);
  const successorUrl = w.url();

  // Edit form locks the status of the closed policy and offers only open statuses otherwise
  await w.goto(`${policyUrl}/edit`);
  await main(w).getByText("Set by the recorded outcome").waitFor();
  check("edit form locks status when an outcome exists", true);
  await w.goto(`${successorUrl}/edit`);
  await main(w).getByLabel("Renewal status").waitFor();
  const opts = await main(w).getByLabel("Renewal status").locator("option").allTextContents();
  check("open policies only offer open statuses", opts.join(",") === "Not started,In progress", opts.join(","));

  // Successor gets its own outcome → undo on the original is refused
  await w.goto(successorUrl);
  await w.waitForLoadState("networkidle");
  await main(w).getByRole("button", { name: "Record outcome" }).click();
  await w.getByRole("dialog").getByLabel("Lost").check();
  await w.getByRole("dialog").getByLabel("Reason").selectOption("price");
  await w.getByRole("dialog").getByRole("button", { name: "Record lost" }).click();
  await main(w).getByRole("button", { name: "Undo outcome" }).waitFor();
  await w.goto(policyUrl);
  await main(w).getByText("The renewal policy already has its own outcome. Undo that one first.").waitFor();
  check("undo refused while the successor has its own outcome", await main(w).getByRole("button", { name: "Undo outcome" }).isDisabled());

  // Undo successor's outcome, then the original
  await w.goto(successorUrl);
  await main(w).getByRole("button", { name: "Undo outcome" }).click();
  await w.getByRole("alertdialog").getByRole("button", { name: "Undo outcome" }).click();
  await main(w).getByRole("button", { name: "Record outcome" }).waitFor();
  await w.goto(policyUrl);
  await main(w).getByRole("button", { name: "Undo outcome" }).click();
  const undoText = await w.getByRole("alertdialog").innerText();
  check("undo dialog says the successor will be deleted", /deletes the renewal policy/.test(undoText));
  await w.getByRole("alertdialog").getByRole("button", { name: "Undo outcome" }).click();
  await main(w).getByRole("button", { name: "Record outcome" }).waitFor();
  check("undo restores the open policy", (await main(w).getByText("In progress", { exact: true }).count()) >= 1);
  const gone = await w.request.get(successorUrl);
  check("successor removed after undo", (await gone.text()).includes("does not exist"));

  // Non-renewed by carrier
  await main(w).getByRole("button", { name: "Record outcome" }).click();
  await w.getByRole("dialog").getByLabel("Non-renewed by carrier").check();
  const nrBtn = w.getByRole("dialog").getByRole("button", { name: "Record non-renewed" });
  check("non-renewed requires a reason", await nrBtn.isDisabled());
  await w.getByRole("dialog").getByLabel("Carrier's reason").fill("Carrier exiting food processing class");
  await nrBtn.click();
  await main(w).getByText("Carrier exiting food processing class").waitFor();
  check("non-renewed recorded", true);

  // Account page: activity newest first, tasks, notes
  await w.goto(accountUrl);
  await main(w).getByRole("heading", { name: "Activity" }).waitFor();
  const firstActs = await main(w).locator("ol[aria-label='Activity, newest first'] li").allInnerTexts();
  const joined = firstActs.join("\n");
  check(
    "activity logs checklist, outcomes, undo and stage changes",
    /Checklist complete/.test(joined) && /Outcome recorded/.test(joined) && /Outcome undone/.test(joined) && /Stage change/.test(joined),
    `${firstActs.length} entries`,
  );
  await main(w).getByLabel("Add a note").fill("Client prefers email over phone.");
  await main(w).getByRole("button", { name: "Add note" }).click();
  await main(w).getByText("Client prefers email over phone.").waitFor();
  check("note added", true);
  const overdueBefore = await main(w).getByText(/^Overdue, due/).count();
  await main(w).getByRole("checkbox", { name: /Mark "Submit to market" done/ }).first().check();
  await w.waitForTimeout(800);
  await w.reload();
  await main(w).getByRole("heading", { name: "Tasks" }).waitFor();
  const overdueAfter = await main(w).getByText(/^Overdue, due/).count();
  check("ticking a task clears an overdue item", overdueAfter === overdueBefore - 1, `${overdueBefore} → ${overdueAfter}`);

  // Moving the as-of date logs stage changes
  await w.goto(`${BASE}/w/${slug}/settings`);
  // The input fills on hydration; wait for a value before reading it.
  await w.waitForFunction(() => document.querySelector("#as-of")?.value);
  const asOf = await main(w).getByLabel("As-of date").inputValue();
  const d = new Date(asOf + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 31);
  await main(w).getByLabel("As-of date").fill(d.toISOString().slice(0, 10));
  await main(w).getByRole("button", { name: "Save settings" }).click();
  await w.getByText("Settings saved").waitFor();
  await w.goto(`${BASE}/w/${slug}`);
  await main(w).getByRole("link", { name: "Northwind Engineering Partners Inc." }).click();
  await main(w).getByRole("heading", { name: "Activity" }).waitFor();
  check("as-of change logs 90-day → 60-day move", (await main(w).getByText(/moved from 90-day: Marketing to 60-day: Quoting/).count()) >= 1);

  // Mobile layouts
  await w.setViewportSize({ width: 375, height: 760 });
  for (const path of [`/w/${slug}/renewals`, `/w/${slug}/renewals?view=list`, new URL(policyUrl).pathname, new URL(accountUrl).pathname]) {
    await w.goto(BASE + path);
    await main(w).locator("h1").first().waitFor();
    const sw = await w.evaluate(() => document.documentElement.scrollWidth);
    check(`no page overflow at 375px: ${path.split("/").slice(3).join("/") || "root"}`, sw <= 376, `scrollWidth=${sw}`);
  }
  await w.goto(`${BASE}/w/${slug}/renewals`);
  await w.screenshot({ path: `${SHOTS}/renewals-mobile.png`, fullPage: true });

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(2);
});
