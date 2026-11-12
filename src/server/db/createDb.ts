/**
 * Database factory for CLI scripts (seed) that run outside Next.js.
 * The app itself uses getDb() from ./client, which is server-only.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type ScriptDb = NeonHttpDatabase<typeof schema>;

export function createDb(url: string): ScriptDb {
  return drizzle({ client: neon(url), schema });
}
