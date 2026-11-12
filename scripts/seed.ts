/**
 * npm run db:seed
 *
 * Creates (or reuses) a workspace and loads the fictional demo book into it.
 *   - With no arguments: creates a new workspace named "Demo brokerage" with the
 *     as-of date set to today (the only place the seed consults the clock).
 *   - SEED_WORKSPACE_SLUG=abc123def4 npm run db:seed → seeds that existing
 *     workspace, using its own as-of date, if it is empty.
 *   - SEED_AS_OF=2026-11-12 overrides the as-of date for a new workspace.
 */
import { eq } from "drizzle-orm";
import { loadLocalEnv, getDatabaseUrl } from "../src/server/env";
import { createDb } from "../src/server/db/createDb";
import { accounts, workspaces } from "../src/server/db/schema";
import { DEMO_WORKSPACE_NAME, loadDemoBook } from "../src/server/db/seed/demoBook";
import { generateWorkspaceSlug } from "../src/server/workspace/slug";
import { isISODate } from "../src/lib/domain/dates";

async function main() {
  loadLocalEnv();
  const url = getDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.");
    process.exit(1);
  }
  const db = createDb(url);

  const slug = process.env.SEED_WORKSPACE_SLUG?.trim();
  let workspace: { id: string; slug: string; asOfDate: string };

  if (slug) {
    const found = await db.query.workspaces.findFirst({ where: eq(workspaces.slug, slug) });
    if (!found) {
      console.error(`No workspace with slug "${slug}".`);
      process.exit(1);
    }
    const existing = await db.query.accounts.findFirst({ where: eq(accounts.workspaceId, found.id) });
    if (existing) {
      console.error(`Workspace "${slug}" already has accounts. Reset it in Settings first, or seed a new workspace.`);
      process.exit(1);
    }
    workspace = found;
  } else {
    const asOf = process.env.SEED_AS_OF?.trim() || new Date().toISOString().slice(0, 10);
    if (!isISODate(asOf)) {
      console.error(`SEED_AS_OF must be YYYY-MM-DD, received "${asOf}".`);
      process.exit(1);
    }
    const [created] = await db
      .insert(workspaces)
      .values({ slug: generateWorkspaceSlug(), name: DEMO_WORKSPACE_NAME, asOfDate: asOf })
      .returning();
    workspace = created;
  }

  const summary = await loadDemoBook(db, workspace.id, workspace.asOfDate);
  console.log(
    `Seeded workspace /w/${workspace.slug} (as of ${workspace.asOfDate}): ${summary.accounts} accounts, ${summary.contacts} contacts, ${summary.policies} policies.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
