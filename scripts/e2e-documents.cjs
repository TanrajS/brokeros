/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser smoke test for v1.4: Documents tab, Policy page certificates, strategy findings
 * (not part of `npm test`; Playwright is not a dependency). Needs BLOB_READ_WRITE_TOKEN on the server.
 *   npm run build && npx next start -p 3077 &
 *   SEED_SLUG=<slug from SEED_AS_OF=2026-11-12 npm run db:seed> SHOT_DIR=/tmp \
 *     NODE_PATH=$(find ~/.npm/_npx -maxdepth 4 -type d -name node_modules | head -1) node scripts/e2e-documents.cjs
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
const flat = (s) => s.replace(/\s+/g, " ").trim();
async function settle(p) {
  await main(p).locator("h1").first().waitFor();
  await p.waitForLoadState("networkidle");
}
const section = (p, id) => main(p).locator(`section[aria-labelledby='${id}']`).filter({ visible: true });
async function openAccount(p, slug, account) {
  await p.goto(`${BASE}/w/${slug}`);
  await settle(p);
  await main(p).getByRole("link", { name: account, exact: true }).click();
  await p.waitForURL(/\/accounts\/[0-9a-f-]{36}$/);
  await settle(p);
  return p.url();
}
// A tiny but valid single-page PDF (fictional content).
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

(async () => {
  if (!SEED) throw new Error("Set SEED_SLUG");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  /* ---------- Seeded workspace: Documents tab (read-only) ---------- */
  const harbourUrl = await openAccount(page, SEED, "Harbourline Foods Inc.");
  await main(page).getByRole("tab", { name: /^Documents/ }).click();
  await page.waitForURL(/\/documents$/);
  await settle(page);
  check("Documents tab selected", (await main(page).getByRole("tab", { name: /^Documents/ }).getAttribute("aria-selected")) === "true");
  check("demo banner says files are fictional, private, not virus-scanned", /Upload only fictional documents/.test(await main(page).innerText()) && /not virus-scanned/.test(await main(page).innerText()));
  const folders = main(page).getByRole("navigation", { name: "Document folders" });
  const pills = (await folders.getByRole("link").allInnerTexts()).map(flat);
  const total = pills.reduce((n, t) => n + Number(t.match(/(\d+)$/)?.[1] ?? 0), 0);
  check("four folders with counts adding to Harbourline's 4 seed documents", pills.length === 4 && /^Proposals/.test(pills[0]) && /^Submissions/.test(pills[1]) && /^Certificates/.test(pills[2]) && /^Policy documents/.test(pills[3]) && total === 4, pills.join(" | "));
  await folders.getByRole("link", { name: /^Certificates/ }).click();
  await page.waitForURL(/folder=certificate/);
  await settle(page);
  const certRow = main(page).locator("tbody tr", { hasText: "Port of Halverston" });
  check("seed certificate listed with the Demo file badge and no reissue flag (GL still in force)", (await certRow.count()) === 1 && /Demo file/.test(await certRow.innerText()) && !/Reissue needed/.test(await certRow.innerText()), flat(await certRow.innerText()).slice(0, 160));
  check("certificate row links to its policy", /General Liability · Dominion Shield Insurance/.test(await certRow.innerText()));
  const dl = await certRow.getByRole("link", { name: /^Download / }).getAttribute("href");
  const res = await page.request.get(`${BASE}${dl}`);
  check("download route streams the PDF through the workspace cookie", res.status() === 200 && /application\/pdf/.test(res.headers()["content-type"] ?? "") && /attachment/.test(res.headers()["content-disposition"] ?? ""), `${res.status()} ${res.headers()["content-type"]}`);
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${BASE}${dl}`);
  check("download refused without the workspace cookie", anonRes.status() === 403 || anonRes.status() === 404, `status ${anonRes.status()}`);
  await anon.close();
  // Filter by policy year
  await folders.getByRole("link", { name: /^Policy documents/ }).click();
  await page.waitForURL(/folder=policy_document/);
  await settle(page);
  await main(page).locator("select[name=year]").selectOption({ index: 1 });
  await main(page).getByRole("button", { name: "Filter" }).click();
  await page.waitForURL(/year=/);
  await settle(page);
  check("policy-year filter produces a shareable URL and a Clear link", /folder=policy_document&year=\d{4}-\d{2}/.test(page.url()) && (await main(page).getByRole("link", { name: "Clear" }).count()) === 1, page.url().replace(BASE, ""));
  await page.screenshot({ path: `${SHOTS}/documents-tab.png`, fullPage: true });

  /* ---------- Seeded workspace: Policy page ---------- */
  await page.goto(harbourUrl);
  await settle(page);
  await main(page).locator("tr", { hasText: "General Liability" }).filter({ hasText: "60 days" }).getByRole("link", { name: "Dominion Shield Insurance", exact: true }).click();
  await page.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await settle(page);
  const claims = section(page, "policy-claims-heading");
  check("policy page lists the claims in this term with a policy-year summary", (await claims.count()) === 1 && (await claims.locator("table").count()) === 2 && /this term/.test(await claims.innerText()) && /Loss ratio/.test(await claims.innerText()));
  const layers = section(page, "policy-program-heading");
  check("policy page shows the GL group's three layers and marks this policy's", (await layers.locator("tbody tr").count()) === 3 && /this policy/.test(await layers.innerText()) && /Open the Program tab/.test(await layers.innerText()));
  const certs = section(page, "certificates-heading");
  check("certificates panel lists the seed certificate and offers Generate certificate", (await certs.locator("tbody tr", { hasText: "Port of Halverston" }).count()) === 1 && (await certs.getByRole("button", { name: "Generate certificate" }).count()) === 1);
  check("deductible schedule, endorsements and documents linked to the policy are on the page", (await section(page, "deductibles-heading").count()) === 1 && /Endorsements/.test(await main(page).innerText()));
  check("no bound-quote wording survives on the policy page", !/bound quote|Bound quote/.test(await main(page).innerText()));

  /* ---------- Writes in a fresh workspace ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const w = await ctx2.newPage();
  w.on("pageerror", (e) => errors.push(String(e)));
  w.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await w.goto(`${BASE}/`);
  await w.waitForURL(/\/w\/[a-z0-9]{10}$/);
  const slug = w.url().split("/w/")[1];
  await main(w).getByRole("button", { name: "Load demo book" }).click();
  await main(w).getByRole("link", { name: "Harbourline Foods Inc." }).waitFor({ timeout: 45000 });
  const harbour2 = await openAccount(w, slug, "Harbourline Foods Inc.");
  await w.goto(`${harbour2}/documents`);
  await settle(w);
  check("new workspace from demo shares the seed blobs (same 4 documents, Demo file badges)", (await main(w).getByRole("navigation", { name: "Document folders" }).innerText()).replace(/\D/g, "").split("").reduce((a, b) => a + Number(b), 0) === 4);

  // Upload validation and a real upload into Proposals
  await main(w).getByRole("button", { name: "Upload proposal" }).first().click();
  let dlg = w.getByRole("dialog");
  check("Upload disabled until a file and title are chosen", await dlg.getByRole("button", { name: "Upload", exact: true }).isDisabled());
  await dlg.locator("#doc-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("fictional") });
  check("disallowed type rejected inline", /Only pdf, docx, xlsx, csv, png, jpg files can be uploaded/.test(await dlg.innerText()));
  await dlg.locator("#doc-file").setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 32) });
  check("oversize file rejected inline", /Files must be 10 MB or smaller/.test(await dlg.innerText()));
  await dlg.locator("#doc-file").setInputFiles({ name: "proposal-draft.pdf", mimeType: "application/pdf", buffer: PDF });
  await dlg.getByLabel("Title").fill("Renewal proposal draft (fictional)");
  await dlg.locator("#doc-status").selectOption("draft");
  await dlg.getByRole("button", { name: "Upload", exact: true }).click();
  await main(w).locator("tbody tr", { hasText: "Renewal proposal draft (fictional)" }).waitFor({ timeout: 30000 });
  await w.waitForLoadState("networkidle");
  const newRow = main(w).locator("tbody tr", { hasText: "Renewal proposal draft (fictional)" });
  check("uploaded proposal listed as Draft with its file name and size", /Draft/.test(await newRow.innerText()) && /proposal-draft\.pdf/.test(await newRow.innerText()) && /KB/.test(await newRow.innerText()));
  const newHref = await newRow.getByRole("link", { name: /^Download / }).getAttribute("href");
  const newRes = await w.request.get(`${BASE}${newHref}`);
  check("uploaded file downloads as the same bytes", newRes.status() === 200 && (await newRes.body()).length === PDF.length, `${newRes.status()} ${(await newRes.body()).length} bytes`);
  // Status filter
  await main(w).locator("select[name=status]").selectOption("final");
  await main(w).getByRole("button", { name: "Filter" }).click();
  await w.waitForURL(/status=final/);
  await settle(w);
  check("status filter hides the draft", (await main(w).locator("tbody tr", { hasText: "Renewal proposal draft (fictional)" }).count()) === 0);
  await main(w).getByRole("link", { name: "Clear" }).click();
  await w.waitForURL(/documents$/);
  await settle(w);
  // Rename
  await newRow.getByRole("button", { name: /^Rename / }).click();
  await main(w).getByLabel("New title").fill("Renewal proposal v2 (fictional)");
  await main(w).getByRole("button", { name: "Save title" }).click();
  await main(w).locator("tbody tr", { hasText: "Renewal proposal v2 (fictional)" }).waitFor();
  check("inline rename saved", (await main(w).locator("tbody tr", { hasText: "Renewal proposal v2 (fictional)" }).count()) === 1);
  // Delete with confirm
  await main(w).locator("tbody tr", { hasText: "Renewal proposal v2 (fictional)" }).getByRole("button", { name: /^Delete / }).click();
  const adlg = w.getByRole("alertdialog");
  check("delete confirm says the file is removed from storage", /removed from storage/.test(await adlg.innerText()));
  await adlg.getByRole("button", { name: "Delete" }).click();
  await w.waitForFunction(() => !document.body.innerText.includes("Renewal proposal v2 (fictional)"));
  check("document deleted", (await main(w).locator("tbody tr", { hasText: "Renewal proposal v2" }).count()) === 0);
  const gone = await w.request.get(`${BASE}${newHref}`);
  check("deleted document's download link is gone", gone.status() === 404, `status ${gone.status()}`);

  // Submissions need at least one market
  await w.goto(`${harbour2}/documents?folder=submission`);
  await settle(w);
  await main(w).getByRole("button", { name: "Upload submission" }).first().click();
  dlg = w.getByRole("dialog");
  await dlg.locator("#doc-file").setInputFiles({ name: "submission.pdf", mimeType: "application/pdf", buffer: PDF });
  await dlg.getByLabel("Title").fill("GL submission (fictional)");
  check("submission without a market cannot be uploaded", await dlg.getByRole("button", { name: "Upload", exact: true }).isDisabled());
  await dlg.locator("#doc-markets").fill("Granville Specialty (fictional)");
  await dlg.getByRole("button", { name: "Add", exact: true }).click();
  check("free-text market added as a chip, insurers offered from the workspace", (await dlg.getByRole("button", { name: "Remove Granville Specialty (fictional)" }).count()) === 1 && (await dlg.locator("#doc-market-list option").count()) > 3);
  await dlg.getByRole("button", { name: "Upload", exact: true }).click();
  await main(w).locator("tbody tr", { hasText: "GL submission (fictional)" }).waitFor({ timeout: 30000 });
  check("submission listed with its market", /Granville Specialty/.test(await main(w).locator("tbody tr", { hasText: "GL submission (fictional)" }).innerText()));

  // Seed document delete keeps the shared blob
  await w.goto(`${harbour2}/documents?folder=policy_document`);
  await settle(w);
  const seedRow = main(w).locator("tbody tr", { hasText: "Statement of values" });
  const seedHref = await seedRow.getByRole("link", { name: /^Download / }).getAttribute("href");
  await seedRow.getByRole("button", { name: /^Delete / }).click();
  check("seed delete says the shared file stays", /shared demo file/.test(await w.getByRole("alertdialog").innerText()));
  await w.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await w.waitForFunction(() => !document.body.innerText.includes("Statement of values"));
  const seedStill = await page.request.get(`${BASE}${dl}`);
  check("the seeded workspace still downloads its copy of a shared seed file", seedStill.status() === 200, `status ${seedStill.status()} (${seedHref})`);

  // Certificate generation on the GL policy
  await w.goto(harbour2);
  await settle(w);
  await main(w).locator("tr", { hasText: "General Liability" }).filter({ hasText: "60 days" }).getByRole("link", { name: "Dominion Shield Insurance", exact: true }).click();
  await w.waitForURL(/\/policies\/[0-9a-f-]{36}$/);
  await settle(w);
  const policyUrl = w.url();
  const panel = section(w, "certificates-heading");
  await panel.getByRole("button", { name: "Generate certificate" }).click();
  const form = panel.locator("form[aria-label='Certificate inputs']");
  check("generate disabled until the holder, address and operations are filled", await form.getByRole("button", { name: "Generate PDF and file it" }).isDisabled());
  await form.getByLabel("Certificate holder (fictional)").fill("Lakeshore Cold Chain Partners (fictional)");
  await form.getByLabel("Holder address").fill("12 Quay Street\nPort Halverston, ON P0X 1L0");
  await form.getByLabel("Description of operations").fill("Cold-storage services under the Quay Street lease.");
  await form.getByLabel(/^Property · Dominion Shield Insurance/).check();
  const preview = panel.locator("figure[aria-label='Certificate preview']");
  check("preview updates live with the holder, the policy facts, the included Property row and the statement", /Lakeshore Cold Chain Partners/.test(await preview.innerText()) && /Policy number/.test(await preview.innerText()) && /Also in force/.test(await preview.innerText()) && /informational/i.test(await preview.innerText()));
  check("preview issue date is the as-of date and the design is Broker OS's own", /Issued 2026-11-12|Issued \d{4}-\d{2}-\d{2}/.test(await preview.innerText()) && /Broker OS/.test(await preview.innerText()));
  await form.getByRole("button", { name: "Generate PDF and file it" }).click();
  await w.getByText("Certificate generated and filed").waitFor({ timeout: 45000 });
  await panel.locator("tbody tr", { hasText: "Lakeshore Cold Chain Partners" }).waitFor();
  await w.waitForLoadState("networkidle");
  const genRow = panel.locator("tbody tr", { hasText: "Lakeshore Cold Chain Partners" });
  check("generated certificate filed on the policy, not flagged for reissue", (await genRow.count()) === 1 && /COI-/.test(await genRow.innerText()) && !/Reissue needed/.test(await genRow.innerText()));
  const genHref = await genRow.getByRole("link", { name: /^Download / }).getAttribute("href");
  const genRes = await w.request.get(`${BASE}${genHref}`);
  const genBody = await genRes.body();
  check("generated certificate is a real PDF", genRes.status() === 200 && genBody.subarray(0, 5).toString() === "%PDF-" && genBody.length > 2000, `${genRes.status()} ${genBody.length} bytes`);
  await w.goto(`${harbour2}/documents?folder=certificate`);
  await settle(w);
  check("generated certificate also appears in the account's Certificates folder", (await main(w).locator("tbody tr", { hasText: "Lakeshore Cold Chain Partners" }).count()) === 1);

  // Findings: accept one into the report (before the renewal, while the GL is still the default policy)
  await w.goto(`${harbour2}/strategy`);
  await settle(w);
  const findings = section(w, "findings-heading");
  const first = findings.locator("ol > li").first();
  check("findings carry evidence, caveats, suggested action and Show the math", /Evidence/.test(await first.innerText()) && /Caveats/.test(await first.innerText()) && /Suggested action/.test(await first.innerText()) && (await first.getByText("Show the math").count()) === 1);
  await first.getByLabel("Accept into report").check();
  await first.getByText("In the report").waitFor();
  await w.waitForLoadState("networkidle");
  await main(w).getByRole("link", { name: "Generate report" }).click();
  await w.waitForURL(/strategy\/report/);
  await settle(w);
  const rf = flat(await section(w, "rp-findings").innerText());
  check("report lists the accepted finding under Findings and candidates for discussion", /candidate to raise the deductible to \$125,000/i.test(rf) && !/No findings were accepted/.test(rf), rf.slice(0, 200));
  // Tolerance form validation
  await w.goto(`${harbour2}/strategy`);
  await settle(w);
  const tol = main(w).locator("form[aria-labelledby='tolerance-heading']");
  await tol.getByLabel("Permissible loss ratio").fill("1.5");
  check("permissible loss ratio above 1 rejected inline", await tol.getByRole("button", { name: "Save tolerance" }).isDisabled());
  await tol.getByLabel("Permissible loss ratio").fill("0.60");
  await tol.getByRole("button", { name: "Save tolerance" }).click();
  await w.getByText("Risk tolerance saved").waitFor();
  await section(w, "assumptions-heading").getByText(/permissible loss ratio 0\.6000/).waitFor({ timeout: 20000 }).catch(() => {});
  check("new ratio drives the estimates (assumptions state 0.6000)", /permissible loss ratio 0\.6000/.test(await section(w, "assumptions-heading").innerText()));

  // Renewing the policy flags every certificate on it for reissue
  await w.goto(policyUrl);
  await settle(w);
  await main(w).getByRole("button", { name: "Record outcome" }).click();
  const odlg = w.getByRole("dialog");
  await odlg.getByLabel("Renewal premium (CAD)").fill("160,000");
  await odlg.getByLabel("Renewal exposure amount").fill("26,000,000");
  await odlg.getByRole("button", { name: "Record renewed" }).click();
  await main(w).getByText("This term vs its renewal").waitFor();
  await w.waitForLoadState("networkidle");
  const flagged = await section(w, "certificates-heading").locator("tbody tr", { hasText: "Reissue needed" }).count();
  check("after the renewal both certificates read Reissue needed", flagged === 2, `${flagged} flagged`);
  check("reissue reason names the successor", /renewed|successor/i.test((await section(w, "certificates-heading").locator("tbody tr").first().locator("[title]").first().getAttribute("title")) ?? ""));

  // Mobile
  await w.setViewportSize({ width: 375, height: 760 });
  for (const url of [`${harbour2}/documents`, `${harbour2}/documents?folder=submission`, policyUrl, `${harbour2}/strategy`]) {
    await w.goto(url);
    await settle(w);
    const sw = await w.evaluate(() => document.documentElement.scrollWidth);
    check(`no page overflow at 375px: ${url.replace(BASE, "").slice(0, 70)}`, sw <= 376, `scrollWidth=${sw}`);
  }
  await w.goto(`${harbour2}/documents`);
  await settle(w);
  await w.screenshot({ path: `${SHOTS}/documents-mobile.png`, fullPage: true });

  check("no browser console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
