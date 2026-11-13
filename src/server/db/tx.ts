import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getDatabaseUrl } from "@/server/env";
import { DatabaseNotConfiguredError, getDb } from "./client";
import * as schema from "./schema";

/** Anything that can run Drizzle queries against our schema: the HTTP client or a transaction. */
export type Executor = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Runs `fn` inside one Postgres transaction. The Neon HTTP driver used for
 * ordinary queries cannot hold a transaction open, so this opens a short-lived
 * WebSocket pool, runs the transaction, and always closes the pool (the
 * pattern Neon recommends for serverless functions).
 */
export async function withTransaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  const url = getDatabaseUrl();
  if (!url) throw new DatabaseNotConfiguredError();
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle({ client: pool, schema });
    return await db.transaction(async (tx) => fn(tx));
  } finally {
    await pool.end();
  }
}

/** The ordinary HTTP client, typed as an Executor so helpers accept either it or a transaction. */
export function getExecutor(): Executor {
  return getDb();
}
