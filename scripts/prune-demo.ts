/**
 * npm run db:prune-demo
 *
 * Removes the demo accounts retired in v1.4 (Ashgrove, Kestrel, Prairie,
 * Bluewater, Copperfield, Maple and Tidewater) from every workspace in the
 * database DATABASE_URL points at. Only accounts the seed wrote (is_seed = true)
 * are deleted; everything hanging off them cascades. Prints how many were
 * removed, per name and per workspace. Safe to run again: it finds nothing.
 */
import { loadLocalEnv, getDatabaseUrl } from "../src/server/env";
import { createDb } from "../src/server/db/createDb";
import { pruneRetiredDemoAccounts } from "../src/server/workspace/prune";

async function main() {
  loadLocalEnv();
  const url = getDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.");
    process.exit(1);
  }
  const db = createDb(url);
  const result = await pruneRetiredDemoAccounts(db, null);
  console.log(`Removed ${result.removed} retired demo account${result.removed === 1 ? "" : "s"} across ${Object.keys(result.byWorkspace).length} workspace${Object.keys(result.byWorkspace).length === 1 ? "" : "s"}.`);
  for (const [name, n] of Object.entries(result.byName).sort()) console.log(`  ${name}: ${n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
