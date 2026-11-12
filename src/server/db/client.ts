import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getDatabaseUrl } from "@/server/env";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

/** Thrown when DATABASE_URL is absent. Callers render the setup page instead of crashing. */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DatabaseNotConfiguredError";
  }
}

let cached: Db | null = null;

/** The only way to reach the database. Import this from src/server only. */
export function getDb(): Db {
  if (cached) return cached;
  const url = getDatabaseUrl();
  if (!url) throw new DatabaseNotConfiguredError();
  cached = drizzle({ client: neon(url), schema });
  return cached;
}

export function isDatabaseConfigured(): boolean {
  return getDatabaseUrl() !== undefined;
}
