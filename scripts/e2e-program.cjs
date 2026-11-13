/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v1 Program (not part of `npm test`; Playwright is not a dependency).
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-program.cjs
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

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  /* ---------- Harbourline (read-only) ---------- */
  await page.goto(`${BASE}/w/${SEED}/placement`);
  await settle(page);
  await main(page).getByRole("link", { name: "Harbourline Foods Inc." }).click();
  await page.waitForURL(/loss-runs$/);
  await main(page).getByRole("link", { name: /^Program/ }).click();
  await page.waitForURL(/\/program$/);
  await settle(page);
  const harbourUrl = page.url();
  const tower = section(page, "tower-heading");
  check("tower continuous, total $16,000,000", (await tower.getByText("Continuous", { exact: true }).count()) === 1 && (await tower.getByText(/Total limit: \$16,000,000/).count()) === 1);
  const rows = await tower.locator("tbody tr").allInnerTexts();
  check("umbrella rate on line 0.44%, excess 0.18%", rows.some((r) => /\$5M xs \$1M[\s\S]*0\.44%/.test(r)) && rows.some((r) => /\$10M xs \$6M[\s\S]*0\.18%/.test(r)));
  check("tower diagram drawn with 3 layers and no hatching", (await tower.locator("figure [role='img'] > div").count()) === 3);
  const req = section(page, "requirements-heading");
  check("umbrella option off by default", (await req.getByText("Off", { exact: true }).count()) === 1);
  const glRow = await req.locator("tbody tr", { hasText: "General Liability" }).innerText();
  check("GL requirement shows $1,000,000 occurrence and $2,000,000 aggregate shortfall", /\$1,000,000 occurrence/.test(glRow) && /\$2,000,000 aggregate/.test(glRow) && /Shortfall/.test(glRow), glRow.replace(/\s+/g, " "));
  check("WC requirement shows Missing coverage", /Missing coverage/.test(await req.locator("tbody tr", { hasText: "Workers Compensation" }).innerText()));
  check("auto requirement flags the missing endorsement", /Additional insured missing/.test(await req.locator("tbody tr", { hasText: "Commercial Auto" }).innerText()));
  check("umbrella requirement Meets", /Meets/.test(await req.locator("tbody tr", { hasText: "Umbrella/Excess" }).innerText()));
  await req.getByRole("link", { name: "Count the umbrella" }).click();
  await page.waitForURL(/umbrella=1/);
  await settle(page);
  const glRow2 = await section(page, "requirements-heading").locator("tbody tr", { hasText: "General Liability" }).innerText();
  check("with umbrella counted: occurrence met, $2,000,000 aggregate shortfall remains", !/occurrence/.test(glRow2) && /\$2,000,000 aggregate/.test(glRow2) && /incl\. \$15,000,000 umbrella/.test(glRow2), glRow2.replace(/\s+/g, " "));
  const certs = section(page, "certificates-heading");
  check("two certificates, both Issued", (await certs.locator("tbody tr").count()) === 2 && (await certs.getByText("Issued", { exact: true }).count()) === 2);
  await page.screenshot({ path: `${SHOTS}/program-harbourline.png`, fullPage: true });

  /* ---------- Cedar Ridge (read-only): gap, adequacy ---------- */
  await page.goto(`${BASE}/w/${SEED}/placement`);
  await settle(page);
  await main(page).getByRole("link", { name: "Cedar Ridge Mechanical Ltd." }).click();
  await page.waitForURL(/loss-runs$/);
  await page.goto(page.url().replace(/loss-runs$/, "program"));
  await settle(page);
  const ctower = section(page, "tower-heading");
  check("Cedar tower not continuous with a $1,000,000 gap", (await ctower.getByText("Not continuous", { exact: true }).count()) === 1 && (await ctower.getByText(/Gap of \$1,000,000/).count()) === 1);
  check("gap drawn as a hatched block", (await ctower.locator("figure [role='img'] > div", { hasText: /^Gap \$1,000,000$/ }).count()) === 1);
  check("construction contract umbrella requirement Meets", /Meets/.test(await section(page, "requirements-heading").locator("tbody tr", { hasText: "Umbrella/Excess" }).innerText()));
  await page.screenshot({ path: `${SHOTS}/program-cedar.png`, fullPage: true });

  // Property policy adequacy
  await page.goto(page.url().replace(/\/placement\/.*$/, ""));
  await settle(page);
  await main(page).getByRole("link", { name: "Cedar Ridge Mechanical Ltd." }).click();
  await settle(page);
  await main(page).locator("tr", { hasText: "Property" }).getByRole("link", { name: "Northgate Mutual", exact: true }).click();
  await page.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await settle(page);
  const adq = section(page, "adequacy-heading");
  await adq.getByText("$800,000").first().waitFor();
  const adqText = (await adq.innerText()).replace(/\s+/g, " ");
  check("adequacy on load: required $800,000, pays $70,000, absorbs $30,000, $200,000 more", /\$800,000/.test(adqText) && /\$70,000/.test(adqText) && /\$30,000/.test(adqText) && /\$200,000/.test(adqText), adqText.slice(0, 200));
  await adq.getByLabel("Hypothetical loss (CAD)").fill("200,000");
  await adq.getByText("$145,000", { exact: true }).waitFor();
  check("adequacy recomputes live", true); // 0.75 × 200,000 − 5,000 = 145,000
  await adq.getByLabel("Limit carried (CAD)").fill("800,000");
  await adq.getByText("$195,000", { exact: true }).waitFor(); // min(200,000, 800,000) − 5,000
  check("carrying the required limit removes the penalty", /No coinsurance penalty/.test(await adq.innerText()));
  check("sub-limits listed on the property policy", (await section(page, "sublimits-heading").locator("tbody tr").count()) === 3);
  await page.screenshot({ path: `${SHOTS}/program-adequacy.png`, fullPage: true });

  /* ---------- Kestrel: co-insurers ---------- */
  await page.goto(`${BASE}/w/${SEED}`);
  await settle(page);
  await main(page).getByRole("link", { name: "Kestrel Precision Components Corp." }).click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  await main(page).getByRole("heading", { name: "Kestrel Precision Components Corp." }).waitFor();
  await page.waitForLoadState("networkidle");
  check("policy row shows +3 insurers", (await main(page).getByText("+3 insurers").count()) === 1);
  await main(page).locator("tr", { hasText: "Property" }).filter({ hasText: "90 days" }).getByRole("link", { name: "Aurora Commercial Underwriters", exact: true }).click();
  await page.waitForURL(/\/policies\//);
  await settle(page);
  const part = section(page, "participants-heading");
  await part.locator("tfoot").waitFor();
  check("participants total 100% and $420,000 with no findings", /100%/.test(await part.locator("tfoot").innerText()) && /\$420,000/.test(await part.locator("tfoot").innerText()) && (await part.locator("ul li").count()) === 0);

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
  await w.goto(`${BASE}/w/${slug}/placement`);
  await settle(w);
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).click();
  await w.waitForURL(/loss-runs$/);
  await w.goto(w.url().replace(/loss-runs$/, "program"));
  await settle(w);
  const programUrl = w.url();

  // Edit the excess layer: live preview, then save → gap
  await section(w, "tower-heading").getByRole("button", { name: "Edit $10M xs $6M" }).click();
  const dlg = w.getByRole("dialog");
  await dlg.getByLabel("Attachment (CAD)").fill("7,000,000");
  await dlg.getByText(/Gap of \$1,000,000/).waitFor();
  check("layer dialog previews the gap as you type", /not continuous/.test(await dlg.innerText()));
  await dlg.getByLabel("Attachment (CAD)").fill("5,000,000");
  await dlg.getByText(/Overlap of \$1,000,000/).waitFor();
  check("layer dialog previews the overlap", true);
  await dlg.getByRole("button", { name: "Save layer" }).click();
  await section(w, "tower-heading").getByText(/Overlap of \$1,000,000/).waitFor();
  check("saved layer recomputes the tower", (await section(w, "tower-heading").getByText("Not continuous", { exact: true }).count()) === 1);
  check("overlap hatched in the diagram", (await section(w, "tower-heading").locator("figure [role='img'] > div", { hasText: /^Overlap \$1,000,000$/ }).count()) === 1);

  // Add a requirement
  await section(w, "requirements-heading").getByRole("button", { name: "Add requirement" }).click();
  const rdlg = w.getByRole("dialog");
  await rdlg.getByLabel("Contract name").fill("Lease — Pier 4 (fictional)");
  await rdlg.getByLabel("Counterparty").fill("Port of Halverston Authority (fictional)");
  check("requirement needs an occurrence limit", await rdlg.getByRole("button", { name: "Save requirement" }).isDisabled());
  await rdlg.getByLabel("Required per occurrence (CAD)").fill("5,000,000");
  await rdlg.getByLabel("Waiver of subrogation").check();
  await rdlg.getByRole("button", { name: "Save requirement" }).click();
  await section(w, "requirements-heading").locator("tbody tr", { hasText: "Lease — Pier 4" }).waitFor();
  const lease = await section(w, "requirements-heading").locator("tbody tr", { hasText: "Lease — Pier 4" }).innerText();
  check("new requirement checked: $4,000,000 occurrence shortfall, waiver present", /\$4,000,000 occurrence/.test(lease) && /✓ Waiver of subrogation/.test(lease), lease.replace(/\s+/g, " "));

  // Record the GL renewal → certificate flips to Reissue needed and appears on Renewals
  await w.goto(programUrl.replace(/\/placement\/.*$/, ""));
  await settle(w);
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).click();
  await settle(w);
  await main(w).locator("tr", { hasText: "General Liability" }).filter({ hasText: "60 days" }).getByRole("link", { name: "Dominion Shield Insurance", exact: true }).click();
  await w.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await settle(w);
  await main(w).getByRole("button", { name: "Record outcome" }).click();
  const odlg = w.getByRole("dialog");
  await odlg.getByLabel("Renewal premium (CAD)").fill("160,000");
  await odlg.getByLabel("Renewal exposure amount").fill("26,000,000");
  await odlg.getByRole("button", { name: "Record renewed" }).click();
  await main(w).getByText("This term vs its renewal").waitFor();
  await w.goto(programUrl);
  await settle(w);
  const portRow = await section(w, "certificates-heading").locator("tbody tr", { hasText: "Port of Halverston" }).innerText();
  check("GL certificate now Reissue needed after the renewal", /Reissue needed/.test(portRow) && /renewed/.test(portRow), portRow.replace(/\s+/g, " "));
  check("auto certificate still Issued", /Issued/.test(await section(w, "certificates-heading").locator("tbody tr", { hasText: "Westbay" }).innerText()));
  await w.goto(`${BASE}/w/${slug}/renewals`);
  await settle(w);
  const due = section(w, "certs-due-heading");
  check("Renewals shows the certificate due", (await due.locator("tbody tr", { hasText: "Port of Halverston" }).count()) === 1);
  // Reissue it
  await w.goto(programUrl);
  await settle(w);
  await section(w, "certificates-heading").locator("tr", { hasText: "Port of Halverston" }).getByRole("button", { name: "Reissue" }).click();
  await section(w, "certificates-heading").locator("tr", { hasText: "Port of Halverston" }).getByText("Issued", { exact: true }).waitFor();
  // The fresh workspace's as-of date is the day it was created, so only check that the issue date moved on from the seeded 26 Oct 2026.
  check("reissue stamps the as-of date and returns to Issued", !/26 Oct 2026/.test(await section(w, "certificates-heading").locator("tr", { hasText: "Port of Halverston" }).innerText()));

  // Add a co-insurer with a short line → finding
  await w.goto(programUrl.replace(/\/placement\/.*$/, ""));
  await settle(w);
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).click();
  await settle(w);
  await main(w).locator("tr", { hasText: "Property" }).getByRole("link", { name: "Dominion Shield Insurance", exact: true }).click();
  await w.waitForURL(/\/policies\//);
  await settle(w);
  await section(w, "participants-heading").getByRole("button", { name: "Add insurer" }).click();
  const pdlg = w.getByRole("dialog");
  await pdlg.getByLabel("Insurer").fill("Dominion Shield Insurance");
  await pdlg.locator("#part-role").selectOption("lead");
  await pdlg.getByLabel("Signed line (%)").fill("60");
  await pdlg.getByLabel("Premium (CAD)").fill("127,200");
  await pdlg.getByRole("button", { name: "Save insurer" }).click();
  await section(w, "participants-heading").getByText(/40% of the placement is unplaced/).waitFor();
  check("short placement flagged", true);

  // Mobile
  await w.setViewportSize({ width: 375, height: 760 });
  await w.goto(programUrl);
  await settle(w);
  const sw = await w.evaluate(() => document.documentElement.scrollWidth);
  check("no page overflow at 375px", sw <= 376, `scrollWidth=${sw}`);
  const fig = section(w, "tower-heading").locator("figure [role='img']");
  const box = await fig.boundingBox();
  check("tower diagram is horizontal on a phone", box !== null && box.width > box.height, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "none");
  await section(w, "tower-heading").screenshot({ path: `${SHOTS}/program-mobile.png` });

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
